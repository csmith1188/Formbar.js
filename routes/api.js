const express = require('express')
const router = express.Router()
const sqlite3 = require('sqlite3').verbose()
const winston = require('winston');

// Establishes the connection to the database file
var db = new sqlite3.Database('database/database.db')

let logNumbers = JSON.parse(fs.readFileSync("logNumbers.json"))

/**
 * Creates a new logger transport with a daily rotation.
 *
 * @param {string} level - The level of logs to record.
 * @returns {winston.transports.DailyRotateFile} The created transport.
 */
function createLoggerTransport(level) {
	// Create a new daily rotate file transport for Winston
	let transport = new winston.transports.DailyRotateFile({
		filename: `logs/application-${level}-%DATE%.log`, // The filename pattern to use
		datePattern: "YYYY-MM-DD-HH", // The date pattern to use in the filename
		maxFiles: "30d", // The maximum number of log files to keep
		level: level // The level of logs to record
	});

	// When the log file is rotated
	transport.on("rotate", function (oldFilename, newFilename) {
		// Reset the error log count
		logNumbers.error = 0;
		// Convert the log numbers to a string
		logNumbersString = JSON.stringify(logNumbers);
		// Write the log numbers to a file
		fs.writeFileSync("logNumbers.json", logNumbersString);
		// Delete the old log file
		fs.unlink(oldFilename, (err) => {
			if (err) {
				// If an error occurred, log it
				logger.log('error', err.stack);
			} else {
				// Otherwise, log that the file was deleted
				console.log("Log file deleted");
			};
		});
	});

	// Return the created transport
	return transport;
};

const logger = winston.createLogger({
	levels: {
		critical: 0,
		error: 1,
		warning: 2,
		info: 3,
		verbose: 4
	},
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.printf(({ timestamp, level, message }) => {
			if (level == "error") {
				logNumbers.error++;
				logNumbersString = JSON.stringify(logNumbers);
				fs.writeFileSync("logNumbers.json", logNumbersString);
				return `[${timestamp}] ${level} - Error Number ${logNumbers.error}: ${message}`;
			} else {
				return `[${timestamp}] ${level}: ${message}`
			}
		})
	),
	transports: [
		createLoggerTransport("critical"),
		createLoggerTransport("error"),
		createLoggerTransport("info"),
		createLoggerTransport("verbose"),
		new winston.transports.Console({ level: 'error' })
	],
})

// Constants
// permissions levels
const MANAGER_PERMISSIONS = 5
const TEACHER_PERMISSIONS = 4
const MOD_PERMISSIONS = 3
const STUDENT_PERMISSIONS = 2
const GUEST_PERMISSIONS = 1
const BANNED_PERMISSIONS = 0


function api(cD) {
	try {
		/**
		 * Retrieves the class code for a given user.
		 *
		 * @param {string} username - The username of the user.
		 * @returns {string|null|Error} The class code if the user is found, null if the user is not found, or an Error object if an error occurs.
		 */
		function getUserClass(username) {
			try {
				// Log the username
				logger.log('info', `[getUserClass] username=(${username})`)

				// Iterate over the class codes
				for (let classCode of Object.keys(cD)) {
					// If the user is a student in the current class
					if (cD[classCode].students[username]) {
						// Log the class code
						logger.log('verbose', `[getUserClass] classCode=(${classCode})`)
						// Return the class code
						return classCode
					}
				}

				// If the user is not found in any class, log null
				logger.log('verbose', `[getUserClass] classCode=(${null})`)
				// Return null
				return null
			} catch (err) {
				// If an error occurs, return the error
				return err
			}
		}

		/**
		 * Asynchronous function to get the username associated with a given API key.
		 * @param {string} api - The API key.
		 * @returns {Promise<string|Object>} A promise that resolves to the username or an error object.
		 */
		async function getUsername(api) {
			try {
				// If no API key is provided, return an error
				if (!api) return { error: 'missing api' }

				// Query the database for the username associated with the API key
				let user = await new Promise((resolve, reject) => {
					db.get(
						'SELECT username FROM users WHERE api = ?',
						[api],
						(err, user) => {
							try {
								// If an error occurs, throw the error
								if (err) throw err

								// If no user is found, resolve the promise with an error object
								if (!user) {
									resolve({ error: 'user not found' })
									return
								}

								// If a user is found, resolve the promise with the user object
								resolve(user)
							} catch (err) {
								// If an error occurs, reject the promise with the error
								reject(err)
							}
						}
					)
				})

				// If an error occurred, return the error
				if (user.error) return user

				// If no error occurred, return the username
				return user.username
			} catch (err) {
				// If an error occurs, return the error
				return err
			}
		}

		/**
		 * Asynchronous function to get the current user's data.
		 * @param {Object} req - The request object.
		 * @returns {Promise|Object} A promise that resolves to the user's data or an error object.
		 */
		async function getCurrentUser(req) {
			try {
				// Log the request details
				logger.log('info', `[getCurrentUser] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

				// Get the username associated with the API key in the request headers
				let username = await getUsername(req.headers.api)
				// If the username is an instance of Error, throw the error
				if (username instanceof Error) throw username
				// If an error occurs, return the error
				if (username.error) return username

				// Get the class code of the user
				let classCode = getUserClass(username)

				// If the class code is an instance of Error, throw the error
				if (classCode instanceof Error) throw classCode

				// Query the database for the user's data
				let dbUser = await new Promise((resolve, reject) => {
					// If the user is not in any class
					if (!classCode || classCode == 'noClass') {
						// Query the database for the user's data
						db.get(
							'SELECT id, username, permissions, NULL AS classPermissions FROM users WHERE username = ?',
							[username],
							(err, dbUser) => {
								try {
									// If an error occurs, throw the error
									if (err) throw err

									// If no user is found, resolve the promise with an error object
									if (!dbUser) {
										resolve({ error: 'user does not exist' })
										return
									}

									// If a user is found, resolve the promise with the user object
									resolve(dbUser)
								} catch (err) {
									// If an error occurs, reject the promise with the error
									reject(err)
								}
							}
						)
						return
					}

					// If the user is in a class, query the database for the user's data and class permissions
					db.get(
						'SELECT users.id, users.username, users.permissions, CASE WHEN users.id = classroom.owner THEN 5 ELSE classusers.permissions END AS classPermissions FROM users INNER JOIN classusers ON users.id = classusers.studentId OR users.id = classroom.owner INNER JOIN classroom ON classusers.classId = classroom.id WHERE classroom.key = ? AND users.username = ?',
						[classCode, username],
						(err, dbUser) => {
							try {
								// If an error occurs, throw the error
								if (err) throw err

								// If no user is found, resolve the promise with an error object
								if (!dbUser) {
									resolve({ error: 'user does not exist in this class' })
									return
								}

								// If a user is found, resolve the promise with the user object
								resolve(dbUser)
							} catch (err) {
								// If an error occurs, reject the promise with the error
								reject(err)
							}
						}
					)
				})
				// If an error occurs, return the error
				if (dbUser.error) return dbUser

				// Create an object to store the user's data
				let userData = {
					loggedIn: false,
					...dbUser,
					help: null,
					break: null,
					quizScore: null,
					pogMeter: null,
					class: classCode
				}

				// If the user is in a class and is logged in
				if (cD[classCode] && cD[classCode].students && cD[classCode].students[dbUser.username]) {
					let cdUser = cD[classCode].students[dbUser.username]
					if (cdUser) {
						// Update the user's data with the data from the class
						userData.loggedIn = true
						userData.help = cdUser.help
						userData.break = cdUser.break
						userData.quizScore = cdUser.quizScore
						userData.pogMeter = cdUser.pogMeter
					}
				}

				// Log the user's data
				logger.log('verbose', `[getCurrentUser] userData=(${JSON.stringify(userData)})`)

				// Return the user's data
				return userData
			} catch (err) {
				// If an error occurs, return the error
				return err
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
					db.all(
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
				if (cD[key])
					cDClassUsers = cD[key].students

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

		/**
		 * Function to get the poll responses in a class.
		 * @param {Object} classData - The data of the class.
		 * @returns {Object} An object containing the poll responses.
		 */
		function getPollResponses(classData) {
			// Create an empty object to store the poll responses
			let tempPolls = {}

			// If the poll is not active, return an empty object
			if (!classData.poll.status) return {}

			// If there are no responses to the poll, return an empty object
			if (Object.keys(classData.poll.responses).length == 0) return {}

			// For each response in the poll responses
			for (let [resKey, resValue] of Object.entries(classData.poll.responses)) {
				// Add the response to the tempPolls object and initialize the count of responses to 0
				tempPolls[resKey] = {
					...resValue,
					responses: 0
				}
			}

			// For each student in the class
			for (let student of Object.values(classData.students)) {
				// If the student exists and has responded to the poll
				if (
					student &&
					Object.keys(tempPolls).includes(student.pollRes.buttonRes)
				)
					// Increment the count of responses for the student's response
					tempPolls[student.pollRes.buttonRes].responses++
			}

			// Return the tempPolls object
			return tempPolls
		}


		// Checks to see if the user is authenticated
		router.use(async (req, res, next) => {
			try {
				// Log the IP and session of the request
				logger.log('info', `[isAuthenticated] ip=(${req.ip}) session=(${JSON.stringify(res.session)})`)

				// Get the current user
				let user = await getCurrentUser(req)
				// If the user is an instance of Error
				if (user instanceof Error) {
					// Respond with a server error message
					res.status(500).json({ error: 'There was a server error try again.' })
					// Throw the error
					throw user
				}
				// If the user has an error property
				if (user.error) {
					// Log the error
					logger.log('info', user)
					// Respond with the error
					res.status(401).json({ error: user.error })
					// End the function
					return
				}

				// If the user exists
				// Set the user in the session
				if (user)
					req.session.user = user

				// Log the authenticated user
				logger.log('info', `[isAuthenticated] user=(${JSON.stringify(req.session.user)})`)

				// Call the next middleware function
				next()
			} catch (err) {
				// Log any errors
				logger.log('error', err.stack)
			}
		})

		// Middleware function to check API permissions.
		router.use((req, res, next) => {
			// Extract user details from the session
			let username = req.session.user.username
			let permissions = req.session.user.permissions
			let classPermissions = req.session.user.classPermissions
			let classCode = req.session.user.class

			// Log the request details
			logger.log('info', `[apiPermCheck] ip=(${req.ip}) session=(${JSON.stringify(req.session)}) url=(${req.url})`)

			// If no URL is provided, return
			if (!req.url) return

			let urlPath = req.url
			// Checks if url has a / in it and removes it from the string
			if (urlPath.indexOf('/') != -1) {
				urlPath = urlPath.slice(urlPath.indexOf('/') + 1)
			}
			// Check for ?(urlParams) and removes it from the string
			if (urlPath.indexOf('?') != -1) {
				urlPath = urlPath.slice(0, urlPath.indexOf('?'))
			}

			// If the URL starts with 'class/', extract the class code
			if (urlPath.startsWith('class/')) {
				classCode = urlPath.split('/')[1]
			}

			// If the URL is 'me', proceed to the next middleware
			if (urlPath == 'me') {
				next()
				return
			}

			if (!classCode || classCode == 'noClass') {
				res.status(404).json({ error: 'You are not in a class' })
				return
			}

			// If the class does not exist, return an error
			if (!cD[classCode]) {
				res.status(404).json({ error: 'Class not started' })
				return
			}

			// If the user is not in the class, return an error
			if (!cD[classCode].students[username]) {
				res.status(404).json({ error: 'You are not in this class.' })
				return
			}

			// If the URL ends with '/polls', proceed to the next middleware
			if (urlPath.endsWith('/polls')) {
				next()
				return
			}

			// If the user does not have sufficient permissions, return an error
			if (
				permissions <= GUEST_PERMISSIONS ||
				classPermissions <= GUEST_PERMISSIONS
			) {
				res.status(403).json({ error: 'You do not have permission to access this page.' })
				return
			}

			// If all checks pass, proceed to the next middleware
			next()
		})

		// Gets the current user
		router.get('/me', async (req, res) => {
			try {
				// Log the request details
				logger.log('info', `[get api/me] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

				// Get the user from the session
				let user = req.session.user

				// Log the user's data
				logger.log('verbose', `[get api/me] response=(${JSON.stringify(user)})`)

				// Send the user's data as a JSON response
				res.status(200).json(user)
			} catch (err) {
				// If an error occurs, log the error and send an error message as a JSON response
				logger.log('error', err.stack)
				res.status(500).json({ error: 'There was a server error try again.' })
			}
		})

		// Gets a class by key
		router.get('/class/:key', async (req, res) => {
			try {
				// Get the class key from the request parameters
				let key = req.params.key

				// Log the request details
				logger.log('info', `[get api/class/${key}] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

				// Get a clone of the class data
				let classData = structuredClone(cD[key])

				// If the class does not exist, return an error
				if (!classData) {
					res.status(404).json({ error: 'Class not started' })
					return
				}

				// Get the poll responses in the class
				classData.poll.responses = getPollResponses(classData)

				// Get the user from the session
				let user = req.session.user

				// If the user is not in the class, return an error
				if (!classData.students[user.username]) {
					logger.log('verbose', `[get api/class/${key}] user is not logged in`)
					res.status(403).json({ error: 'User is not logged into the selected class' })
					return
				}

				// Get the users of the class
				let classUsers = await getClassUsers(user, key)

				// If an error occurs, log the error and return the error
				if (classUsers.error) {
					logger.log('info', `[get api/class/${key}] ${classUsers}`)
					res.status(404).json(classUsers)
					return
				}

				// Update the class data with the class users and remove the shared polls
				classData.students = classUsers
				delete classData.sharedPolls

				// Log the class data
				logger.log('verbose', `[get api/class/${key}] response=(${JSON.stringify(classData)})`)
				// Send the class data as a JSON response
				res.status(200).json(classData)
			} catch (err) {
				// If an error occurs, log the error and send an error message as a JSON response
				logger.log('error', err.stack)
				res.status(500).json({ error: 'There was a server error try again.' })
			}
		})

		// Gets the students of a class
		router.get('/class/:key/students', async (req, res) => {
			try {
				// Get the class key from the request parameters
				let key = req.params.key

				// Log the request details
				logger.log('info', `get api/class/${key}/students ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

				// If the class does not exist, return an error
				if (!cD[key]) {
					logger.log('verbose', `[get api/class/${key}/students] class not started`)
					res.status(404).json({ error: 'Class not started' })
					return
				}

				// Get the user from the session
				let user = req.session.user

				// If the user is not in the class, return an error
				if (!cD[key].students[user.username]) {
					logger.log('verbose', `[get api/class/${key}/students] user is not logged in`)
					res.status(403).json({ error: 'User is not logged into the selected class' })
					return
				}

				// Get the students of the class
				let classUsers = await getClassUsers(user, key)

				// If an error occurs, log the error and return the error
				if (classUsers.error) {
					logger.log('info', `[get api/class/${key}] ${classUsers}`)
					res.status(404).json(classUsers)
				}

				// Log the students of the class
				logger.log('verbose', `[get api/class/${key}/students] response=(${JSON.stringify(classUsers)})`)
				// Send the students of the class as a JSON response
				res.status(200).json(classUsers)
			} catch (err) {
				// If an error occurs, log the error and send an error message as a JSON response
				logger.log('error', err.stack)
				res.status(500).json({ error: 'There was a server error try again.' })
			}
		})

		// Gets the polls of a class
		router.get('/class/:key/polls', (req, res) => {
			try {
				// Get the class key from the request parameters
				let key = req.params.key

				// Log the request details
				logger.log('info', `[get api/class/${key}/polls] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

				// If the class does not exist, return an error
				if (!cD[key]) {
					logger.log('verbose', `[get api/class/${key}/polls] class not started`)
					res.status(404).json({ error: 'Class not started' })
					return
				}

				// Get the user from the session
				let user = req.session.user

				// If the user is not in the class, return an error
				if (!cD[key].students[user.username]) {
					logger.log('verbose', `[get api/class/${key}/polls] user is not logged in`)
					res.status(403).json({ error: 'User is not logged into the selected class' })
					return
				}

				// Get a clone of the class data and the poll responses in the class
				let classData = structuredClone(cD[key])
				classData.poll.responses = getPollResponses(classData)

				// If the class does not exist, return an error
				if (!classData) {
					logger.log('verbose', `[get api/class/${key}/polls] class not started`)
					res.status(404).json({ error: 'Class not started' })
					return
				}

				// Update the class data with the poll status, the total number of students, and the poll data
				classData.poll = {
					status: classData.status,
					totalStudents: Object.keys(classData.students).length,
					...classData.poll
				}

				// Log the poll data
				logger.log('verbose', `[get api/class/${key}/polls] response=(${JSON.stringify(classData.poll)})`)
				// Send the poll data as a JSON response
				res.status(200).json(classData.poll)
			} catch (err) {
				// If an error occurs, log the error
				logger.log('error', err.stack)
				res.status(500).json({ error: 'There was a server error try again.' })
			}
		})

		// Gets the permissions of a class
		router.get('/class/:key/permissions', async (req, res) => {
			try {
				// Get the class key from the request parameters
				let key = req.params.key

				// Log the request details
				logger.log('info', `[get api/class/${key}/permissions] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

				// Get a clone of the class data
				let classData = structuredClone(cD[key])
				// If the class does not exist, return an error
				if (!classData) {
					res.status(404).json({ error: 'Class not started' })
					return
				}

				// Get the user from the session
				let user = req.session.user

				// If the user is not in the class, return an error
				if (!classData.students[user.username]) {
					logger.log('verbose', `[get api/class/${key}/permissions] user is not logged in`)
					res.status(403).json({ error: 'User is not logged into the selected class' })
					return
				}

				// Log the class permissions
				logger.log('verbose', `[get api/class/${key}/permissions] response=(${JSON.stringify(classData.permissions)})`)
				// Send the class permissions as a JSON response
				res.status(200).json(classData.permissions)
			} catch (err) {
				// If an error occurs, log the error and send an error message as a JSON response
				logger.log('error', err.stack)
				res.status(500).json({ error: 'There was a server error try again.' })
			}
		})

		return router
	} catch (err) {
		logger.log('error', err.stack)
	}
}

module.exports = api