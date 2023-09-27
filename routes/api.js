const express = require('express')
const router = express.Router()
const sqlite3 = require('sqlite3').verbose()

var db = new sqlite3.Database('database/database.db')

// gets user data from the database based on the api key
async function getUser(request) {
	let user

	if (!request.headers.api) return { error: 'no API Key' }

	user = new Promise((resolve, reject) => {
		db.get(
			'SELECT id, username, permissions FROM users WHERE API = ?',
			[request.headers.api],
			(error, userData) => {
				if (error) {
					return reject(error)
				}
				else if (userData) {
					if (request.query.class) {
						userData.class = request.query.class
					}
					return resolve(userData)
				} else {
					console.log(userData)
					return reject('not a valid API Key')
				}
			}
		)
	})
	return user
		.then(userData => {
			return userData
		})
		.catch(error => {
			return { error: error }
		})
}

// checks to see if the user is authenticated
async function isAuthenticated(request, response, next) {
	let user = await getUser(request)
	if (user) request.session.user = user

	if (user.error) {
		response.json(user.error)
	} else next()
}

const api = (cD) => {
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
		let user = await getUser(request)
		if (!user || !user.username)
			response.json({ error: 'user not logged in or missing API key' })
		else if (
			!user.class ||
			!cD[user.class] ||
			!cD[user.class].students[user.username]
		) {
			db.get('SELECT id, username, permissions FROM users where username=?',
				[user.username],
				(error, userData) => {
					if (error) console.log(error)
					else {
						response.json({
							loggedIn: false,
							username: userData.username,
							id: userData.id,
							permissions: userData.permissions,
							help: null,
							break: null,
							quizScore: null
						})
					}
				}
			)
		}
		else
			response.json({
				loggedIn: true,
				...cD[user.class].students[user.username],
				pollRes: undefined
			})
	})

	// returns the class data from the class code called key
	router.get('/class/:key', async (request, response) => {
		let user = await getUser(request)
		let key = request.params.key

		if (!cD[key])
			response.json({ error: 'class not started' })
		else if (!cD[key].students[user.username])
			response.json({ error: 'user is not logged into the select class' })
		else {
			let classData = Object.assign({}, cD[key])
			for (let username of Object.keys(classData.students)) {
				delete classData.students[username].pollRes
			}
			response.json(classData)
		}
	})

	// returns the logged in users in a class
	router.get('/class/:key/current-students', (request, response) => {
		let key = request.params.key

		if (!cD[key]) {
			response.json({ error: 'class not started' })
			return
		}

		let classData = Object.assign({}, cD[key])
		for (let username of Object.keys(classData.students)) {
			delete classData.students[username].pollRes
		}
		response.json(classData)
	})

	// returns all the users in a class
	router.get('/class/:key/all-students', (request, response) => {
		let key = request.params.key

		if (!cD[key]) {
			response.json({ error: 'class not started' })
			return
		}

		db.all(
			'SELECT DISTINCT users.id, users.username, CASE WHEN users.username = classroom.owner THEN users.permissions ELSE classusers.permissions END AS permissions FROM users INNER JOIN classusers ON users.id = classusers.studentuid OR users.username = classroom.owner INNER JOIN classroom ON classusers.classuid = classroom.id WHERE classroom.key = ?',
			[key],
			(error, dbClassData) => {
				if (error) console.log(error)
				if (dbClassData) {
					console.log(dbClassData)
					// response.json(dbClassData)
					// return
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
				}
			})
	})

	// returns the poll data for a class
	router.get('/class/:key/polls', (request, response) => {
		let key = request.params.key
		let classData = cD[key]
		let polls = {}

		if (!classData) {
			response.status(404).json({ error: 'class not started' })
			return
		}
		if (!classData.pollStatus) {
			response.status(404).json({ error: 'no poll' })
			return
		}

		for (let [username, student] of Object.entries(classData.students)) {
			if (student.break == true || student.permissions == 0) delete classData.students[username]
		}

		if (Object.keys(classData.posPollResObj).length > 0) {
			for (let [resKey, resValue] of Object.entries(classData.posPollResObj)) {
				polls[resKey] = {
					display: resValue,
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

		for (let i = 0; i < Object.keys(polls).length; i++) {
			let color = ''
			let CC = '0123456789ABCDEF'
			let colorI = CC[Math.floor(i / 2)]
			let colorJ = CC[15 - Math.floor(i / 2)]
			switch (i % 4) {
				case 0:
					color = `#${colorJ}${colorJ}${colorI}${colorI}${colorI}${colorI}`
					break
				case 1:
					color = `#${colorI}${colorI}${colorJ}${colorJ}${colorI}${colorI}`
					break
				case 2:
					color = `#${colorI}${colorI}${colorI}${colorI}${colorJ}${colorJ}`
					break
				case 3:
					color = `#${colorJ}${colorJ}${colorJ}${colorJ}${colorI}${colorI}`
					break
			}
			polls[Object.keys(polls)[i]].color = color
		}

		response.json({
			totalStudents: Object.keys(classData.students).length,
			pollPrompt: classData.pollPrompt,
			polls: polls
		})
	})

	return router
}

module.exports = api