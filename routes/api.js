const express = require('express')
const router = express.Router()
const sqlite3 = require('sqlite3').verbose()
const winston = require('winston');

var db = new sqlite3.Database('database/database.db')

const logger = winston.createLogger({
	level: 'info',
	format: winston.format.json(),
	defaultMeta: { service: 'user-service' },
	transports: [
		//
		// - Write all logs with importance level of `error` or less to `error.log`
		// - Write all logs with importance level of `info` or less to `combined.log`
		//
		new winston.transports.File({ filename: 'error.log', level: 'error' }),
		new winston.transports.File({ filename: 'combined.log' }),
	],
})

// gets user data from the database based on the api key
async function getUser(request) {
	try {
		if (!request.headers.api) return { error: 'no API Key' }

		let user = new Promise((resolve, reject) => {
			db.get(
				'SELECT id, username, permissions FROM users WHERE API = ?',
				[request.headers.api],
				(error, userData) => {
					try {
						if (error) return reject(error)

						if (!userData) return reject('not a valid API Key')

						if (request.query.class) {
							userData.class = request.query.class
						}
						return resolve(userData)
					} catch (err) {
						reject(err)
					}
				}
			)
		})

		return user
	} catch (err) {
		logger.log('error', err)
	}
}

// checks to see if the user is authenticated
async function isAuthenticated(request, response, next) {
	try {
		let user = await getUser(request).catch(err => { logger.log('error', err) })

		if (user.error) {
			response.json(user.error)
			return
		}

		if (user) request.session.user = user

		next()
	} catch (err) {
		logger.log('error', err)
	}
}

function api(cD) {
	try {
		// remove restricted data from the class data
		for (let classData of Object.values(cD)) {
			for (let studentData of Object.values(classData.students)) {
				delete studentData.API
				delete studentData.pollTextRes
			}
		}

		router.use(isAuthenticated)

		// returns the user
		router.get('/me', async (request, response) => {
			try {
				let user = await getUser(request).catch(err => { logger.log('error', err) })

				if (user.error) {
					response.json(user.error)
					return
				}

				if (!user || !user.username) {
					response.json({ error: 'missing API key' })
					return
				}

				if (
					!user.class ||
					!cD[user.class] ||
					!cD[user.class].students[user.username]
				) {
					db.get('SELECT id, username, permissions FROM users where username=?',
						[user.username],
						(error, userData) => {
							try {
								if (error) {
									console.log(error)
									return
								}

								response.json({
									loggedIn: false,
									username: userData.username,
									id: userData.id,
									permissions: userData.permissions,
									help: null,
									break: null,
									quizScore: null
								})
							} catch (err) {
								logger.log('error', err)
							}
						}
					)
					return
				}

				response.json({
					loggedIn: true,
					...cD[user.class].students[user.username],
					pollRes: undefined
				})
			} catch (err) {
				logger.log('error', err)
			}
		})

		// returns the class data from the class code called key
		router.get('/class/:key', async (request, response) => {
			try {
				let user = await getUser(request)

				if (user.error) {
					response.json(user.error)
					return
				}

				let key = request.params.key

				if (!cD[key]) {
					response.json({ error: 'class not started' })
					return
				}

				if (!cD[key].students[user.username]) {
					response.json({ error: 'user is not logged into the select class' })
					return
				}

				let classData = structuredClone(cD[key])
				for (let username of Object.keys(classData.students)) {
					delete classData.students[username].pollRes
					classData.students[username] = Object.assign({ loggedIn: true }, classData.students[username])
				}
				response.json(classData)
			} catch (err) {
				logger.log('error', err)
			}
		})

		// returns the logged in users in a class
		router.get('/class/:key/current-students', (request, response) => {
			try {
				let key = request.params.key

				if (!cD[key]) {
					response.json({ error: 'class not started' })
					return
				}

				let classData = structuredClone(cD[key])
				for (let username of Object.keys(classData.students)) {
					delete classData.students[username].pollRes
					delete classData.students[username].API
				}
				response.json(classData)
			} catch (err) {
				logger.log('error', err)
			}
		})

		// returns all the users in a class
		router.get('/class/:key/all-students', (request, response) => {
			try {
				let key = request.params.key

				if (!cD[key]) {
					response.json({ error: 'class not started' })
					return
				}

				db.all(
					'SELECT DISTINCT users.id, users.username, CASE WHEN users.username = classroom.owner THEN users.permissions ELSE classusers.permissions END AS permissions FROM users INNER JOIN classusers ON users.id = classusers.studentuid OR users.username = classroom.owner INNER JOIN classroom ON classusers.classuid = classroom.id WHERE classroom.key = ?',
					[key],
					(error, dbClassData) => {
						try {
							if (error) {
								logger.log('error', error)
								return
							}

							if (!dbClassData) {
								response.json({ error: 'class does not exist' })
								return
							}

							let students = {}
							for (let dbUser of dbClassData) {
								let currentUser = cD[key].students[dbUser.username]
								students[dbUser.username] = {
									loggedIn: currentUser ? true : false,
									username: dbUser.username,
									id: dbUser.id,
									permissions: dbUser.permissions,
									help: currentUser ? currentUser.help : null,
									break: currentUser ? currentUser.break : null,
									quizScore: currentUser ? currentUser.quizScore : null
								}
							}
							response.json(students)
						} catch (err) {
							logger.log('error', err)
						}
					}
				)
			} catch (err) {
				logger.log('error', err)
			}
		})

		// returns the poll data for a class
		router.get('/class/:key/polls', (request, response) => {
			try {
				let key = request.params.key
				let classData = structuredClone(cD[key])
				let polls = {}

				if (!classData) {
					response.json({ error: 'class not started' })
					return
				}

				if (!classData.pollStatus) {
					response.json({ error: 'no poll' })
					return
				}

				for (let [username, student] of Object.entries(classData.students)) {
					if (student.break == true || student.permissions == 0) delete classData.students[username]
				}

				if (Object.keys(classData.posPollResObj).length > 0) {
					for (let [resKey, resValue] of Object.entries(classData.posPollResObj)) {
						polls[resKey] = {
							...resValue,
							responses: 0
						}
					}
					for (let studentData of Object.values(classData.students)) {
						if (
							studentData &&
							Object.keys(polls).includes(studentData.pollRes)
						)
							polls[studentData.pollRes].responses++
					}
				}

				response.json({
					totalStudents: Object.keys(classData.students).length,
					pollPrompt: classData.pollPrompt,
					blindPoll: classData.blindPoll,
					polls: polls
				})
			} catch (err) {
				logger.log('error', err)
			}
		})

		return router
	} catch (err) {
		logger.log('error', err)
	}
}

module.exports = api