const { database } = require("./database")
const { logger } = require("./logger")
const { MOD_PERMISSIONS, STUDENT_PERMISSIONS } = require("./permissions")

// This class is used to add a new classroom to the session data
// The classroom will be used to add lessons, do lessons, and for the teacher to operate them
class Classroom {
	// Needs the name of the class you want to create
	constructor(id, className, key, permissions, sharedPolls, pollHistory, tags) {
		this.id = id
		this.className = className
		this.students = {}
		this.sharedPolls = sharedPolls || []
		this.poll = {
			status: false,
			responses: {},
			textRes: false,
			prompt: '',
			weight: 1,
			blind: false,
			requiredTags: [],
			studentBoxes: [],
			studentIndeterminate: [],
			lastResponse: [],
			allowedResponses: []
		}
		this.key = key
		this.lesson = {}
		this.activeLesson = false
		this.steps
		this.currentStep = 0
		this.quiz = false
		this.mode = 'poll'
		this.permissions = permissions
		this.pollHistory = pollHistory || []
		this.tagNames = tags || [];
		this.timer = {
			startTime: 0,
			timeLeft: 0,
			active: false,
			sound: false
		}
	}
}

function createClassInformation() {
    return {
        noClass: { students: {} }
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
				'SELECT DISTINCT users.id, users.username, users.permissions, CASE WHEN users.id = classroom.owner THEN 5 ELSE classusers.permissions END AS classPermissions FROM users INNER JOIN classusers ON users.id = classusers.studentId OR users.id = classroom.owner INNER JOIN classroom ON classusers.classId = classroom.id WHERE classroom.key = ?',
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
		if (classInformation[key])
			cDClassUsers = classInformation[key].students

		// For each user in the class
		for (let user of dbClassUsers) {
			// Add the user to the class users object
			classUsers[user.username] = {
				loggedIn: false,
				...user,
				help: null,
				break: null,
				quizScore: null,
				pogMeter: null
			}

			// If the user is logged in
			let cdUser = cDClassUsers[user.username]
			if (cdUser) {
				// Update the user's data with the data from the class
				classUsers[user.username].loggedIn = true
				classUsers[user.username].help = cdUser.help
				classUsers[user.username].break = cdUser.break
				classUsers[user.username].quizScore = cdUser.quizScore
				classUsers[user.username].pogMeter = cdUser.pogMeter
			}

			// If the user has mod permissions or lower
			if (classPermissions <= MOD_PERMISSIONS) {
				// Update the user's help and break data
				if (classUsers[user.username].help)
					classUsers[user.username].help = true
				if (typeof classUsers[user.username].break == 'string')
					classUsers[user.username].break = false
			}

			// If the user has student permissions or lower
			if (classPermissions <= STUDENT_PERMISSIONS) {
				// Remove the user's permissions, class permissions, help, break, quiz score, and pog meter data
				delete classUsers[user.username].permissions
				delete classUsers[user.username].classPermissions
				delete classUsers[user.username].help
				delete classUsers[user.username].break
				delete classUsers[user.username].quizScore
				delete classUsers[user.username].pogMeter
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

module.exports = {
    Classroom,
    getClassUsers,

    // classInformation stores all of the information on classes and students
    classInformation: createClassInformation()
}