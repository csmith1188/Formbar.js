const express = require('express')
const router = express.Router()
const sqlite3 = require('sqlite3').verbose()
const winston = require('winston');

var db = new sqlite3.Database('database/database.db')

const logger = winston.createLogger({
	levels: {
		'critical': 0,
		'error': 1,
		'warning': 2,
		'info': 3,
		'verbose': 4
	},
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.printf(({ timestamp, level, message }) => {
			return `[${timestamp}] ${level}: ${message}`
		})
	),
	transports: [
		new winston.transports.File({ filename: 'logs/critical.log', level: 'critical' }),
		new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
		new winston.transports.File({ filename: 'logs/info.log', level: 'info' }),
		new winston.transports.File({ filename: 'logs/verbose.log', level: 'verbose' }),
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
		// checks to see if the user is authenticated
		async function isAuthenticated(req, res, next) {
			try {
				logger.log('info', `[isAuthenticated] ip=(${req.ip}) session=(${JSON.stringify(res.session)})`)

				let user = await getCurrentUser(req)

				if (user instanceof Error) {
					res.json({ error: 'There was a server error try again.' })
					throw user
				}
				if (user.error) {
					logger.log('info', user.error)
					res.json({ error: user.error })
					return
				}

				if (user)
					req.session.user = user

				logger.log('info', `[isAuthenticated] user=(${JSON.stringify(req.session.user)})`)

				next()
			} catch (err) {
				logger.log('error', err.stack)
			}
		}

		function apiPermCheck(req, res, next) {
			let username = req.session.user.username
			let permissions = req.session.user.permissions
			let classPermissions = req.session.user.classPermissions
			let classCode = req.session.user.class

			logger.log('info', `[apiPermCheck] ip=(${req.ip}) session=(${JSON.stringify(req.session)}) url=(${req.url})`)

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

			if (urlPath.startsWith('class/')) {
				classCode = urlPath.split('/')[1]
			}

			console.log(urlPath)
			if (urlPath == 'me') {
				next()
				return
			}

			if (!cD[classCode]) {
				res.json({ error: 'Class not started' })
				return
			}

			if (!cD[classCode].students[username]) {
				res.json({ error: 'You are not in this class.' })
				return
			}

			if (urlPath.endsWith('/polls')) {
				console.log('polls')
				next()
				return
			}

			if (
				permissions <= GUEST_PERMISSIONS ||
				classPermissions <= GUEST_PERMISSIONS
			) {
				res.json({ error: 'You do not have permission to access this page.' })
				return
			}

			next()
		}

		// gets a user's current class
		function getUserClass(username) {
			try {
				logger.log('info', `[getUserClass] username=(${username})`)

				for (let classCode of Object.keys(cD)) {
					if (cD[classCode].students[username]) {
						logger.log('verbose', `[getUserClass] classCode=(${classCode})`)
						return {
							classCode: classCode,
							classPermissions: cD[classCode].students[username].classPermissions
						}
					}
				}

				logger.log('verbose', `[getUserClass] classCode=(${null})`)
				return { classCode: null, classPermissions: null }
			} catch (err) {
				return { error: err }
			}
		}

		// gets a user's name from api
		async function getUsername(api) {
			try {
				if (!api) return 'missing api'

				let user = await new Promise((resolve, reject) => {
					db.get(
						'SELECT username FROM users WHERE api = ?',
						[api],
						(err, user) => {
							try {
								if (err) throw err
								resolve(user)
							} catch (err) {
								reject(err)
							}
						}
					)
				})

				return user.username
			} catch (err) {
				return err
			}
		}

		// gets user data from the database based on the api key
		async function getCurrentUser(req) {
			try {
				logger.log('info', `[getCurrentUser] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

				let username = await getUsername(req.headers.api)
				if (username instanceof Error) throw username

				let { classCode, error } = getUserClass(username)
				if (error) throw error

				let dbUser = await new Promise((resolve, reject) => {
					if (!classCode) {
						db.get(
							'SELECT id, username, permissions, NULL AS classPermissions FROM users WHERE username = ?',
							[username],
							(err, dbUser) => {
								try {
									if (err) throw err

									if (!dbUser) {
										resolve({ error: 'user does not exist in this class' })
									}

									resolve(dbUser)
								} catch (err) {
									reject(err)
								}
							}
						)
						return
					}

					db.get(
						'SELECT users.id, users.username, users.permissions, CASE WHEN users.id = classroom.owner THEN 5 ELSE classusers.permissions END AS classPermissions FROM users INNER JOIN classusers ON users.id = classusers.studentId OR users.id = classroom.owner INNER JOIN classroom ON classusers.classId = classroom.id WHERE classroom.key = ? AND users.username = ?',
						[classCode, username],
						(err, dbUser) => {
							try {
								if (err) throw err

								if (!dbUser) {
									resolve({ error: 'user does not exist in this class' })
								}

								resolve(dbUser)
							} catch (err) {
								reject(err)
							}
						}
					)
				})
				if (dbUser.error) return dbUser

				let userData = {
					loggedIn: false,
					...dbUser,
					help: null,
					break: null,
					quizScore: null,
					pogMeter: null
				}

				if (cD[classCode] && cD[classCode].students && cD[classCode].students[dbUser.username]) {
					let cdUser = cD[classCode].students[dbUser.username]
					if (cdUser) {
						userData.loggedIn = true
						userData.help = cdUser.help
						userData.break = cdUser.break
						userData.quizScore = cdUser.quizScore
						userData.pogMeter = cdUser.pogMeter
					}
				}

				logger.log('verbose', `[getCurrentUser] userData=(${JSON.stringify(userData)})`)

				return userData
			} catch (err) {
				return err
			}
		}

		// gets all users from a class
		async function getClassUsers(user, key) {
			try {
				let classPermissions = user.classPermissions

				logger.log('info', `[getClassUsers] classCode=(${key})`)

				let dbClassUsers = await new Promise((resolve, reject) => {
					db.all(
						'SELECT DISTINCT users.id, users.username, users.permissions, CASE WHEN users.id = classroom.owner THEN 5 ELSE classusers.permissions END AS classPermissions FROM users INNER JOIN classusers ON users.id = classusers.studentId OR users.id = classroom.owner INNER JOIN classroom ON classusers.classId = classroom.id WHERE classroom.key = ?',
						[key],
						(err, dbClassUsers) => {
							try {
								if (err) throw err

								if (!dbClassUsers) {
									resolve({ error: 'class does not exist' })
								}

								resolve(dbClassUsers)
							} catch (err) {
								reject(err)
							}
						}
					)
				})
				if (dbClassUsers.error) return dbClassUsers

				let classUsers = {}
				let cDClassUsers = {}
				if (cD[key])
					cDClassUsers = cD[key].students

				for (let user of dbClassUsers) {
					classUsers[user.username] = {
						loggedIn: false,
						...user,
						help: null,
						break: null,
						quizScore: null,
						pogMeter: null
					}

					let cdUser = cDClassUsers[user.username]
					if (cdUser) {
						classUsers[user.username].loggedIn = true
						classUsers[user.username].help = cdUser.help
						classUsers[user.username].break = cdUser.break
						classUsers[user.username].quizScore = cdUser.quizScore
						classUsers[user.username].pogMeter = cdUser.pogMeter
					}

					if (classPermissions <= STUDENT_PERMISSIONS) {
						delete classUsers[user.username].permissions
						delete classUsers[user.username].classPermissions
						delete classUsers[user.username].help
						delete classUsers[user.username].break
						delete classUsers[user.username].quizScore
						delete classUsers[user.username].pogMeter
					}

					if (classPermissions <= MOD_PERMISSIONS) {
						delete classUsers[user.username].permissions
						delete classUsers[user.username].classPermissions
						classUsers[user.username].help = Boolean(classUsers[user.username].help)
						classUsers[user.username].break = Boolean(classUsers[user.username].break)
						delete classUsers[user.username].quizScore
					}
				}

				logger.log('verbose', `[getClassUsers] classUsers=(${JSON.stringify(classUsers)})`)

				return classUsers
			} catch (err) {
				return err
			}
		}


		// gets user data from the database based on the api key
		async function getUser(user, key) {
			try {
				let classPermissions = user.classPermissions

				logger.log('info', `[getUser] classCode=(${key})`)

				let dbUser = await new Promise((resolve, reject) => {
					db.get(
						'SELECT DISTINCT users.id, users.username, users.permissions, CASE WHEN users.id = classroom.owner THEN 5 ELSE classusers.permissions END AS classPermissions FROM users INNER JOIN classusers ON users.id = classusers.studentId OR users.id = classroom.owner INNER JOIN classroom ON classusers.classId = classroom.id WHERE classroom.key = ? AND users.id = ?',
						[key, user.id],
						(err, dbUser) => {
							try {
								if (err) throw err

								if (!dbUser) {
									resolve({ error: 'user does not exist in this class' })
								}

								resolve(dbUser)
							} catch (err) {
								reject(err)
							}
						}
					)
				})
				if (dbUser.error) return dbUser

				let userData = {
					loggedIn: false,
					...dbUser,
					help: null,
					break: null,
					quizScore: null,
					pogMeter: null
				}

				if (cD[key] && cD[key].students && cD[key].students[dbUser.username]) {
					let cdUser = cD[key].students[dbUser.username]
					if (cdUser) {
						userData.loggedIn = true
						userData.help = cdUser.help
						userData.break = cdUser.break
						userData.quizScore = cdUser.quizScore
						userData.pogMeter = cdUser.pogMeter
					}
				}

				if (classPermissions <= STUDENT_PERMISSIONS) {
					delete userData.permissions
					delete userData.classPermissions
					delete userData.help
					delete userData.break
					delete userData.quizScore
					delete userData.pogMeter
				}

				if (classPermissions <= MOD_PERMISSIONS) {
					delete userData.permissions
					delete userData.classPermissions
					userData.help = Boolean(userData.help)
					userData.break = Boolean(userData.break)
					delete userData.quizScore
				}

				logger.log('verbose', `[getUser] userData=(${JSON.stringify(userData)})`)

				return userData
			} catch (err) {
				return err
			}
		}

		// remove restricted data from the class data
		for (let classData of Object.values(cD)) {
			for (let studentData of Object.values(classData.students)) {
				delete studentData.API
				delete studentData.pollTextRes
			}
		}

		router.use(isAuthenticated)
		router.use(apiPermCheck)

		// returns the user
		router.get('/me', async (req, res) => {
			try {
				logger.log('info', `[get api/me] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

				let user = req.session.user

				logger.log('verbose', `[get api/me] response=(${JSON.stringify(user)}`)
				res.json(user)
			} catch (err) {
				logger.log('error', err.stack)
				res.json({ error: 'There was a server error try again.' })
			}
		})

		// returns the class data from the class code called key
		router.get('/class/:key', async (req, res) => {
			try {
				let key = req.params.key

				logger.log('info', `[get api/class/${key}] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

				let classData = structuredClone(cD[key])
				if (!classData) {
					res.json({ error: 'Class not started' })
					return
				}

				let user = req.session.user

				if (!classData.students[user.username]) {
					logger.log('verbose', `[get api/class/${key}] user is not logged in`)
					res.json({ error: 'User is not logged into the selected class' })
					return
				}

				let classUsers = await getClassUsers(user, key)

				if (classUsers.error) {
					logger.log('info', `[get api/class/${key}] ${classUsers.error}`)
					res.json(classUsers)
				}

				classData.students = classUsers

				logger.log('verbose', `[get api/class/${key}] response=(${JSON.stringify(classData)})`)
				res.json(classData)
			} catch (err) {
				logger.log('error', err.stack)
				res.json({ error: 'There was a server error try again.' })
			}
		})

		// returns all the users in a class
		router.get('/class/:key/students', async (req, res) => {
			try {
				let key = req.params.key

				logger.log('info', `get api/class/${key}/students ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

				if (!cD[key]) {
					logger.log('verbose', `[get api/class/${key}/students] class not started`)
					res.json({ error: 'Class not started' })
					return
				}


				let user = req.session.user

				if (!cD[key].students[user.username]) {
					logger.log('verbose', `[get api/class/${key}/students] user is not logged in`)
					res.json({ error: 'User is not logged into the selected class' })
					return
				}

				let classUsers = await getClassUsers(user, key)

				if (classUsers.error) {
					logger.log('info', `[get api/class/${key}] ${classUsers.error}`)
					res.json(classUsers)
				}

				logger.log('verbose', `[get api/class/${key}/students] response=(${JSON.stringify(classUsers)})`)
				res.json(classUsers)
			} catch (err) {
				logger.log('error', err.stack)
				res.json({ error: 'There was a server error try again.' })
			}
		})

		router.get('/test', async (req, res) => {
			let user = req.session.user

			let a = await test(user, '5hn7')
			res.json(a)
		})

		// returns the poll data for a class
		router.get('/class/:key/polls', (req, res) => {
			try {
				let key = req.params.key

				logger.log('info', `[get api/class/${key}/polls] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

				if (!cD[key]) {
					logger.log('verbose', `[get api/class/${key}/polls] class not started`)
					res.json({ error: 'Class not started' })
					return
				}

				let user = req.session.user

				if (!cD[key].students[user.username]) {
					logger.log('verbose', `[get api/class/${key}/polls] user is not logged in`)
					res.json({ error: 'User is not logged into the selected class' })
					return
				}

				let classData = structuredClone(cD[key])
				let polls = {}

				if (!classData) {
					logger.log('verbose', `[get api/class/${key}/polls] class not started`)
					res.json({ error: 'Class not started' })
					return
				}

				if (!classData.poll.status) {
					logger.log('verbose', `[get api/class/${key}/polls] response=(${JSON.stringify({ status: classData.poll.status, totalStudents: Object.keys(classData.students).length, pollPrompt: classData.poll.prompt, blindPoll: classData.poll.blind, weight: classData.poll.weight, polls: polls })})`)
					res.json({
						status: classData.poll.status,
						totalStudents: Object.keys(classData.students).length,
						pollPrompt: classData.poll.prompt,
						blindPoll: classData.poll.blind,
						weight: classData.poll.weight,
						polls: polls
					})
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

				logger.log('verbose', `[get api/class/${key}/polls] response=(${JSON.stringify({ status: classData.poll.status, totalStudents: Object.keys(classData.students).length, pollPrompt: classData.poll.prompt, blindPoll: classData.poll.blindPoll, weight: classData.poll.weight, polls: polls })})`)
				res.json({
					status: classData.poll.status,
					totalStudents: Object.keys(classData.students).length,
					pollPrompt: classData.poll.prompt,
					blindPoll: classData.poll.blindPoll,
					weight: classData.poll.weight,
					polls: polls
				})
			} catch (err) {
				logger.log('error', err.stack)
			}
		})

		return router
	} catch (err) {
		logger.log('error', err.stack)
	}
}

module.exports = api