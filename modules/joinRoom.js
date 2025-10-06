const { logger } = require("./logger");
const { Classroom, classInformation } = require("./class/classroom");
const { BANNED_PERMISSIONS, TEACHER_PERMISSIONS } = require("./permissions");
const { database } = require("./database");
const { advancedEmitToClass, setClassOfApiSockets } = require("./socketUpdates");
const { userSocketUpdates } = require("../sockets/init");

async function joinRoomByCode(code, session) {
	try {
		const email = session.email;
		logger.log('info', `[joinClass] email=(${email}) classCode=(${code})`)

		// Find the id of the class from the database
		const classroom = await new Promise((resolve, reject) => {
			database.get('SELECT * FROM classroom WHERE key=?', [code], (err, classroom) => {
				if (err) {
					reject(err)
					return
				}
				resolve(classroom)
			})
		})

		// Check to make sure there was a class with that code
		if (!classroom) {
			logger.log('info', '[joinClass] No class with that code')
			return 'No class with that code'
		}

		if (classroom.tags) {
			classroom.tags = classroom.tags.split(",");
		} else {
			classroom.tags = [];
		}

		// Load the classroom into the classInformation object if it's not already loaded
		if (!classInformation.classrooms[classroom.id]) {
			classInformation.classrooms[classroom.id] = new Classroom(classroom.id, classroom.name, classroom.key, classroom.owner, classroom.permissions, classroom.sharedPolls, classroom.pollHistory, classroom.tags)
		}

		// Find the id of the user who is trying to join the class
		let user = await new Promise((resolve, reject) => {
			database.get('SELECT id FROM users WHERE email=?', [email], (err, user) => {
				if (err) {
					reject(err)
					return
				}
				resolve(user)
			})
		})

		if (!user && !classInformation.users[email]) {
			logger.log('critical', '[joinClass] User is not in database')
			return 'user is not in database'
		} else if (classInformation.users[email] && classInformation.users[email].isGuest) {
			user = classInformation.users[email];
		}

		// If the user is not a guest, then link them to the class
		let classUser
		if (!user.isGuest) {
			// Add the two id's to the junction table to link the user and class
			classUser = await new Promise((resolve, reject) => {
				database.get('SELECT * FROM classusers WHERE classId=? AND studentId=?', [classroom.id, user.id], (err, classUser) => {
					if (err) {
						reject(err)
						return
					}
					resolve(classUser)
				})
			})
		}

		if (classUser) {
			// Get the student's session data ready to transport into new class
			let currentUser = classInformation.users[email]
			if (classUser.permissions <= BANNED_PERMISSIONS) {
				logger.log('info', '[joinClass] User is banned')
				return 'You are banned from that class.'
			}

			// Set class permissions and clear any previous tags so they don't persist across classes
			currentUser.classPermissions = classUser.permissions
			currentUser.activeClass = classroom.id;
			currentUser.tags = [];
			classInformation.users[email].tags = [];
			database.run('UPDATE users SET tags = ? WHERE id = ?', ['', user.id], () => { });

			// Redact the API key from the classroom user to prevent it from being sent anywhere
			const studentAPIKey = currentUser.API;
			currentUser = structuredClone(currentUser);
			currentUser.API = undefined;

			// Add the student to the newly created class
			classInformation.classrooms[classroom.id].students[email] = currentUser
			classInformation.classrooms[classroom.id].poll.studentsAllowedToVote.push(currentUser.id)
			classInformation.users[email].activeClass = classroom.id
			advancedEmitToClass('joinSound', classroom.id, {})

			// Set session class and classId
			session.classId = classroom.id;

			// Set the class of the API socket
			setClassOfApiSockets(studentAPIKey, classroom.id);

			// Only call classUpdate if userSocketUpdates exists for this email (guests don't have this)
			if (userSocketUpdates[email]) {
				userSocketUpdates[email].classUpdate(classroom.id, { restrictToControlPanel: true });
			}

			logger.log('verbose', `[joinClass] classInformation=(${classInformation})`)
			return true
		} else {
			// If the user is not a guest, then insert them into the database
			if (!user.isGuest) {
				await new Promise((resolve, reject) => {
					database.run('INSERT INTO classusers(classId, studentId, permissions, digiPogs) VALUES(?, ?, ?, ?)', [classroom.id, user.id, classInformation.classrooms[classroom.id].permissions.userDefaults, 0], (err) => {
						if (err) {
							reject(err)
							return
						}
						resolve()
					})
				})

				logger.log('info', '[joinClass] Added user to classusers')
			}

			// Grab the user from the users list
			const classData = classInformation.classrooms[classroom.id];
			let currentUser = classInformation.users[email]
			currentUser.classPermissions = currentUser.id !== classData.owner ? classData.permissions.userDefaults : TEACHER_PERMISSIONS
			currentUser.activeClass = classroom.id
			currentUser.tags = [];

			// Redact the API key from the classroom user to prevent it from being sent anywhere
			const studentAPIKey = currentUser.API;
			currentUser = structuredClone(currentUser);
			currentUser.API = undefined;

			// Add the student to the newly created class
			classData.students[email] = currentUser
			classData.poll.studentsAllowedToVote.push(currentUser.id)
			classInformation.users[email].activeClass = classroom.id
			const controlPanelPermissions = Math.min(
				classData.permissions.controlPolls,
				classData.permissions.manageStudents,
				classData.permissions.manageClass
			)

			setClassOfApiSockets(studentAPIKey, classroom.id);

			// Only call classUpdate if userSocketUpdates exists for this email (guests don't have this)
			if (userSocketUpdates[email]) {
				userSocketUpdates[email].classUpdate(classroom.id, { restrictToControlPanel: true })
			}

			logger.log('verbose', `[joinClass] classInformation=(${classInformation})`)
			return true
		}
	} catch (err) {
		throw err
	}
}

module.exports = {
	joinRoomByCode,
}
