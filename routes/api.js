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

function api(cD) {
	try {
		// checks to see if the user is authenticated
		async function isAuthenticated(req, res, next) {
			try {
				logger.log('info', `[isAuthenticated] ip=(${req.ip}) session=(${JSON.stringify(res.session)})`)

				let user = await getUser(req)

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

				next()
			} catch (err) {
				logger.log('error', err)
			}
		}

		// gets a user's current class
		function getUserClass(username) {
			try {
				logger.log('info', `[getUserClass] username=(${username})`)

				for (let classCode of Object.keys(cD)) {
					if (cD[classCode].students[username]) {
						logger.log('verbose', `[getUserClass] classCode=(${classCode})`)
						return classCode
					}
				}

				logger.log('verbose', `[getUserClass] classCode=(${null})`)
				return null
			} catch (err) {
				return err
			}
		}

		// gets user data from the database based on the api key
		async function getUser(req) {
			try {
				logger.log('info', `[getUser]`)

				if (!req.headers.api) return { error: 'No API key' }

				let user = await new Promise((resolve, reject) => {
					db.get(
						'SELECT id, username, permissions FROM users WHERE API = ?',
						[req.headers.api],
						(err, userData) => {
							try {
								if (err) throw err

								if (!userData) {
									resolve({ error: 'Not a valid API key' })
									return
								}

								let classCode = getUserClass(userData.username)

								if (classCode instanceof Error) throw classCode
								if (classCode) userData.class = classCode
								else userData.class = null

								return resolve(userData)
							} catch (err) {
								reject(err)
							}
						}
					)
				})

				return user
			} catch (err) {
				return err
			}
		}

		// gets all users from a class
		async function getClassUsers(key) {
			try {
				logger.log('info', `[getClassUsers] classCode=(${key})`)

				let dbClassUsers = await new Promise((resolve, reject) => {
					db.all(
						'SELECT DISTINCT users.id, users.username, users.permissions, CASE WHEN users.id = classroom.owner THEN 5 ELSE classusers.permissions END AS classPermissions FROM users INNER JOIN classusers ON users.id = classusers.studentuid OR users.id = classroom.owner INNER JOIN classroom ON classusers.classuid = classroom.id WHERE classroom.key = ?',
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
				}

				logger.log('verbose', `[getClassUsers] classUsers=(${JSON.stringify(classUsers)})`)

				return classUsers
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

		// returns the user
		router.get('/me', async (req, res) => {
			try {
				logger.log('info', `[get api/me] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

				let user = req.session.user

				if (
					!user.class ||
					!cD[user.class] ||
					!cD[user.class].students[user.username]
				) {
					db.get('SELECT id, username, permissions FROM users where username=?',
						[user.username],
						(err, userData) => {
							try {
								if (err) throw err

								logger.log('verbose', `[get api/me] response=(${JSON.stringify({ loggedIn: false, username: userData.username, id: userData.id, permissions: userData.permissions, help: null, break: null, quizScore: null })}`)
								res.json({
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

				logger.log('verbose', `[get api/me] response=(${JSON.stringify({ loggedIn: true, ...cD[user.class].students[user.username], pollRes: undefined })})`)
				res.json({
					loggedIn: true,
					...cD[user.class].students[user.username],
					pollRes: undefined
				})
			} catch (err) {
				logger.log('error', err)
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

				let classUsers = await getClassUsers(key)

				if (classUsers.error) {
					logger.log('info', `[get api/class/${key}] ${classUsers.error}`)
					res.json(classUsers)
				}

				classData.students = classUsers

				logger.log('verbose', `[get api/class/${key}] response=(${JSON.stringify(classData)})`)
				res.json(classData)
			} catch (err) {
				logger.log('error', err)
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

				let classUsers = await getClassUsers(key)

				if (classUsers.error) {
					logger.log('info', `[get api/class/${key}] ${classUsers.error}`)
					res.json(classUsers)
				}

				logger.log('verbose', `[get api/class/${key}/students] response=(${JSON.stringify(classUsers)})`)
				res.json(classUsers)
			} catch (err) {
				logger.log('error', err)
				res.json({ error: 'There was a server error try again.' })
			}
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
				logger.log('error', err)
			}
		})

		return router
	} catch (err) {
		logger.log('error', err)
	}
}

module.exports = api