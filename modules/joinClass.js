const { logger } = require("./logger");
const { Classroom, classInformation } = require("./class");
const { BANNED_PERMISSIONS } = require("./permissions");
const { database } = require("./database");
const { advancedEmitToClass, setClassOfApiSockets } = require("./socketUpdates");

async function joinClass(code, session) {
	const username = session.username;
	try {
	
		logger.log('info', `[joinClass] username=(${username}) classCode=(${code})`)

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
			classInformation.classrooms[classroom.id] = new Classroom(classroom.id, classroom.name, classroom.key, classroom.permissions, classroom.sharedPolls, classroom.pollHistory, classroom.tags)
		}

		// Find the id of the user who is trying to join the class
		let user = await new Promise((resolve, reject) => {
			database.get('SELECT id FROM users WHERE username=?', [username], (err, user) => {
				if (err) {
					reject(err)
					return
				}
				resolve(user)
			})
		})

		if (!user && !classInformation.users[username]) {
			logger.log('critical', '[joinClass] User is not in database')
			return 'user is not in database'
		} else if (classInformation.users[username] && classInformation.users[username].isGuest) {
			user = classInformation.users[username];
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
			let currentUser = classInformation.users[username]
			if (classUser.permissions <= BANNED_PERMISSIONS) {
				logger.log('info', '[joinClass] User is banned')
				return 'You are banned from that class.'
			}

			// Set class permissions and remove the user's Offline tag if their tags aren't null
			currentUser.classPermissions = classUser.permissions
			if (currentUser.tags) {
				currentUser.tags = currentUser.tags.replace('Offline', '');	
				classInformation.users[username].tags = classInformation.users[username].tags.replace('Offline', '')
			}

			// Add the student to the newly created class
			classInformation.classrooms[classroom.id].students[username] = currentUser			
			classInformation.users[username].activeClasses.push(classroom.id)
			advancedEmitToClass('joinSound', classroom.id, { api: true })

			// Set session class and classId
			session.classId = classroom.id;

			// Set the class of the API socket
			setClassOfApiSockets(currentUser.API, classroom.id);

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
			const currentUser = classInformation.users[username];
			currentUser.classPermissions = classData.permissions.userDefaults;

			// Add the student to the class
			classData.students[username] = currentUser;
			let cpPermissions = Math.min(
				classData.permissions.controlPolls,
				classData.permissions.manageStudents,
				classData.permissions.manageClass
			)

			advancedEmitToClass('cpUpdate', classroom.id, { classPermissions: cpPermissions }, classData);
			logger.log('verbose', `[joinClass] classInformation=(${classInformation})`)
			return true
		}
	} catch (err) {
		throw err
	}
}

module.exports = {
    joinClass
}