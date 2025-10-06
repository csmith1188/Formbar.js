const { database } = require("../database")
const { logger } = require("../logger")
const { MOD_PERMISSIONS, STUDENT_PERMISSIONS, DEFAULT_CLASS_PERMISSIONS } = require("../permissions");

const classInformation = createClassInformation();

// This class is used to add a new classroom to the session data
// The classroom will be used to add lessons, do lessons, and for the teacher to operate them
class Classroom {
	// Needs the name of the class you want to create
	constructor(id, className, key, owner, permissions, sharedPolls, pollHistory, tags, settings) {
		this.id = id
		this.className = className
		this.isActive = false
        this.owner = owner
		this.students = {}
		this.sharedPolls = sharedPolls || []
        this.studentsAllowedToVote = []
		this.poll = {
			status: false,
            prompt: '',
			responses: {},
			allowTextResponses: false,
            allowMultipleResponses: false,
            blind: false,
			weight: 1,
			requiredTags: [],
			studentsAllowedToVote: []
		}
		this.key = key
		// Ensure permissions is an object, not a JSON string
		try {
			this.permissions = typeof permissions === 'string' ? JSON.parse(permissions) : (permissions || DEFAULT_CLASS_PERMISSIONS)
		} catch (err) {
			// Fallback to defaults if parsing fails
			this.permissions = DEFAULT_CLASS_PERMISSIONS
		}
		this.pollHistory = pollHistory || []
		this.tags = tags || ['Offline'];
		this.settings = settings || {
			mute: false,
			filter: '',
			sort: ''
		}
		this.timer = {
			startTime: 0,
			timeLeft: 0,
			active: false,
			sound: false
		}

		if (!this.tags.includes('Offline') && Array.isArray(this.tags)) {
			this.tags.push('Offline');
		}
	}
}

function createClassInformation() {
    return {
		users: {},
		classrooms: {}
    }
}

/**
 * Asynchronous function to get the users of a class.
 * @param {Object} user - The user object.
 * @param {string} key - The class key.
 * @returns {Promise|Object} A promise that resolves to the class users or an error object.
 */
async function getClassUsers(user, key) {
	try {
		// Get the class permissions of the user
		let classPermissions = user.classPermissions

		// Log the class code
		logger.log('info', `[getClassUsers] classCode=(${key})`)

		// Query the database for the users of the class
		let dbClassUsers = await new Promise((resolve, reject) => {
			database.all(
				'SELECT DISTINCT users.id, users.email, users.permissions, CASE WHEN users.id = classroom.owner THEN 5 ELSE classusers.permissions END AS classPermissions FROM users INNER JOIN classusers ON users.id = classusers.studentId OR users.id = classroom.owner INNER JOIN classroom ON classusers.classId = classroom.id WHERE classroom.key = ?',
				[key],
				(err, dbClassUsers) => {
					try {
						// If an error occurs, throw the error
						if (err) throw err

						// If no users are found, resolve the promise with an error object
						if (!dbClassUsers) {
							resolve({ error: 'class does not exist' })
							return
						}

						// If users are found, resolve the promise with the users
						resolve(dbClassUsers)
					} catch (err) {
						// If an error occurs, reject the promise with the error
						reject(err)
					}
				}
			)
		})
	
		// If an error occurs, return the error
		if (dbClassUsers.error) return dbClassUsers

		// Create an object to store the class users
		let classUsers = {}
		let cDClassUsers = {}
		let classId = await getClassIDFromCode(key)
		if (classInformation.classrooms[classId]) {
			cDClassUsers = classInformation.classrooms[classId].students
		}

		// For each user in the class
		for (let user of dbClassUsers) {
			// Add the user to the class users object
			classUsers[user.email] = {
				loggedIn: false,
				...user,
				help: null,
				break: null,
				pogMeter: 0
			}

			// If the user is logged in
			let cdUser = cDClassUsers[user.email]
			if (cdUser) {
				// Update the user's data with the data from the class
				classUsers[user.email].loggedIn = true
				classUsers[user.email].help = cdUser.help
				classUsers[user.email].break = cdUser.break
				classUsers[user.email].pogMeter = cdUser.pogMeter
			}

			// If the user has mod permissions or lower
			if (classPermissions <= MOD_PERMISSIONS) {
				// Update the user's help and break data
				if (classUsers[user.email].help) {
					classUsers[user.email].help = true
				}

				if (typeof classUsers[user.email].break == 'string') {
					classUsers[user.email].break = false
				}
			}

			// If the user has student permissions or lower
			if (classPermissions <= STUDENT_PERMISSIONS) {
				// Remove the user's permissions, class permissions, help, break, quiz score, and pog meter data
				delete classUsers[user.email].permissions
				delete classUsers[user.email].classPermissions
				delete classUsers[user.email].help
				delete classUsers[user.email].break
				delete classUsers[user.email].pogMeter
			}
		}

		// Log the class users
		logger.log('verbose', `[getClassUsers] classUsers=(${JSON.stringify(classUsers)})`)

		// Return the class users
		return classUsers
	} catch (err) {
		// If an error occurs, return the error
		return err
	}
}

const classCache = {}
function getClassIDFromCode(code) {
	if (classCache[code]) {
		return classCache[code]
	}

	return new Promise((resolve, reject) => {
		database.get('SELECT id FROM classroom WHERE key = ?', [code], (err, classroom) => {
			if (err) {
				reject(err)
				return
			}

			if (!classroom) {
				resolve(null)
				return
			}

			classCache[code] = classroom.id
			resolve(classroom.id)
		})
	})
}

module.exports = {
    Classroom,
	getClassUsers,
	getClassIDFromCode,

    // classInformation stores all of the information on classes and students
	classInformation
}