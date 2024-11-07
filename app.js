// Imported modules
const express = require('express')
const session = require('express-session') // For storing client login data
const { encrypt, decrypt } = require('./crypto.js') // For encrypting passwords
const jwt = require('jsonwebtoken') // For authentication system between Plugins and Formbar
const excelToJson = require('convert-excel-to-json')
const multer = require('multer') // Used to upload files
const upload = multer({ dest: 'uploads/' }) // Selects a file destination for uploaded files to go to, will create folder when file is submitted(?)
const crypto = require('crypto')
const fs = require("fs")
const { isAuthenticated, isLoggedIn, permCheck } = require('./modules/authentication.js')
const { logger } = require('./modules/logger.js')
const { logNumbers, settings } = require('./modules/config.js')
const { MANAGER_PERMISSIONS, TEACHER_PERMISSIONS, GUEST_PERMISSIONS, STUDENT_PERMISSIONS, MOD_PERMISSIONS, BANNED_PERMISSIONS, DEFAULT_CLASS_PERMISSIONS, CLASS_SOCKET_PERMISSIONS, CLASS_SOCKET_PERMISSION_SETTINGS, GLOBAL_SOCKET_PERMISSIONS } = require('./modules/permissions.js')
const { classInformation, Classroom } = require('./modules/class.js')
const { Student } = require('./modules/student.js')
const database = require('./modules/database.js')

const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)

// Set EJS as our view engine
app.set('view engine', 'ejs')

// Create session for user information to be transferred from page to page
const sessionMiddleware = session({
	secret: crypto.randomBytes(256).toString('hex'), //Used to sign into the session via cookies
	resave: false, //Used to prevent resaving back to the session store, even if it wasn't modified
	saveUninitialized: false //Forces a session that is new, but not modified, or "uninitialized" to be saved to the session store
})

// Sets up middleware for the server by calling sessionMiddleware
// adds session middleware to express
app.use(sessionMiddleware)

// For further uses on this use this link: https://socket.io/how-to/use-with-express-session
// Uses a middleware function to successfully transmit data between the user and server
// adds session middle ware to socket.io
io.use((socket, next) => {
	sessionMiddleware(socket.request, socket.request.res || {}, next)
})

// Allows express to parse requests
app.use(express.urlencoded({ extended: true }))

// Use a static folder for web page assets
app.use(express.static(__dirname + '/static'))
app.use('/js/chart.js', express.static(__dirname + '/node_modules/chart.js/dist/chart.umd.js'))
app.use('/js/iro.js', express.static(__dirname + '/node_modules/@jaames/iro/dist/iro.min.js'))
app.use('/js/floating-ui-core.js', express.static(__dirname + '/node_modules/@floating-ui/core/dist/floating-ui.core.umd.min.js'))
app.use('/js/floating-ui-dom.js', express.static(__dirname + '/node_modules/@floating-ui/dom/dist/floating-ui.dom.umd.min.js'))

/*This line is executing a SQL query using the get method from a db object. The get method is typically part of a SQLite database interface in Node.js.
The SQL query is SELECT MAX(id) FROM poll_history, which retrieves the maximum is value from the poll_history table. This is typically the id of the
most recently added record. The result of the query is passed to a callback function as the second argument (pollHistory), and any error that occurred
during the execution of the query is passed as the first argument (err).*/
database.get('SELECT MAX(id) FROM poll_history', (err, pollHistory) => {
	/*This is an error handling block. If an error occurred during the execution of the SQL query (i.e., if err is not null), then the error is logged
	using a logger object's log method. The log method is called with two arguments: a string indicating the severity level of the log ('error'), and 
	the stack trace of the error (err.stack).*/
	if (err) {
		logger.log('error', err.stack)
	} else {
		/*If no error occurred during the execution of the SQL query, then the id of the current poll is set to one less than the maximum id value
		retrieved from the poll_history table. This is because the database starts the ids at 1, and not 0, meaning, in order to access the proper
		value in the pollHistory array, you must subtract one.*/
		currentPoll = pollHistory['MAX(id)'] - 1
		//These lines close the else block and the callback function, respectively.
	}
})

/*This line declares a constant array named PASSIVE_SOCKETS. The const keyword means that the variable cannot be reassigned. However, the
contents of the array can still be modified.*/
const PASSIVE_SOCKETS = [
	//An event name for updating a poll.
	'pollUpdate',
	//An event name for updating the mode.
	'modeUpdate',
	//An event name for updating the quiz mode.
	'quizUpdate',
	//An event name for updating the lesson mode.
	'lessonUpdate',
	//An event name for updating the manager panel.
	'managerUpdate',
	//An event name for updating the ip address list.
	'ipUpdate',
	//An event name for updating the virtual bar, shortened to vb.
	'vbUpdate',
	//An event name for updating the control panel, shortened to cp.
	'cpUpdate',
	//An event name for updating the plugin list.
	'pluginUpdate',
	//An event name for updating the custom poll list/data.
	'customPollUpdate',
	//An event name for updating the list of banned users in a class.
	'classBannedUsersUpdate'
]

// Add currentUser and permission constants to all pages
app.use((req, res, next) => {
	if (req.session.class)
		res.locals.currentUser = classInformation[req.session.class].students[req.session.username]

	res.locals = {
		...res.locals,
		MANAGER_PERMISSIONS,
		TEACHER_PERMISSIONS,
		MOD_PERMISSIONS,
		STUDENT_PERMISSIONS,
		GUEST_PERMISSIONS,
		BANNED_PERMISSIONS
	}

	next()
})

// Functions
// General functions
function convertHSLToHex(hue, saturation, lightness) {
	try {
		logger.log('info', `[convertHSLToHex] hue=${hue}, saturation=${saturation}, lightness=${lightness}`)

		// Normalize lightness to range 0-1
		lightness /= 100;

		// Calculate chroma
		const chroma = saturation * Math.min(lightness, 1 - lightness) / 100;

		// Function to get color component
		function getColorComponent(colorIndex) {
			try {
				const colorPosition = (colorIndex + hue / 30) % 12;
				const colorValue = lightness - chroma * Math.max(Math.min(colorPosition - 3, 9 - colorPosition, 1), -1);

				// Return color component in hexadecimal format
				return Math.round(255 * colorValue).toString(16).padStart(2, '0');
			} catch (err) {
				return err
			}
		}

		// Return the hex color
		logger.log('verbose', `[convertHSLToHex]  color=(${getColorComponent(0)}${getColorComponent(8)}${getColorComponent(4)})`)

		let red = getColorComponent(0)
		let green = getColorComponent(8)
		let blue = getColorComponent(4)

		if (red instanceof Error) throw red
		if (green instanceof Error) throw green
		if (blue instanceof Error) throw blue

		return `#${red}${green}${blue}`;
	} catch (err) {
		return err
	}
}

function generateColors(amount) {
	try {
		logger.log('info', `[generateColors] amount=(${amount})`)
		// Initialize colors array
		let colors = []

		// Initialize hue
		let hue = 0

		// Generate colors
		for (let i = 0; i < amount; i++) {
			// Add color to the colors array
			let color = convertHSLToHex(hue, 100, 50)

			if (color instanceof Error) throw color

			colors.push(color);

			// Increment hue
			hue += 360 / amount
		}

		// Return the colors array
		logger.log('verbose', `[generateColors] colors=(${colors})`)
		return colors
	} catch (err) {
		return err
	}
}

function getUserClass(username) {
	try {
		logger.log('info', `[getUserClass] username=(${username})`)

		for (let classCode of Object.keys(classInformation)) {
			if (classInformation[classCode].students[username]) {
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

function joinClass(username, code) {
	return new Promise((resolve, reject) => {
		try {
			logger.log('info', `[joinClass] username=(${username}) classCode=(${code})`)

			// Find the id of the class from the database
			database.get('SELECT id FROM classroom WHERE key=?', [code], (err, classroom) => {
				try {
					if (err) {
						reject(err)
						return
					}

					// Check to make sure there was a class with that code
					if (!classroom || !classInformation[code]) {
						logger.log('info', '[joinClass] No open class with that code')
						resolve('no open class with that code')
						return
					}

					// Find the id of the user who is trying to join the class
					database.get('SELECT id FROM users WHERE username=?', [username], (err, user) => {
						try {
							if (err) {
								reject(err)
								return
							}

							if (!user) {
								logger.log('critical', '[joinClass] User is not in database')
								resolve('user is not in database')
								return
							}

							// Add the two id's to the junction table to link the user and class
							database.get('SELECT * FROM classusers WHERE classId=? AND studentId=?', [classroom.id, user.id], (err, classUser) => {
								try {
									if (err) {
										reject(err)
										return
									}

									if (classUser) {
										// Get the student's session data ready to transport into new class
										let user = classInformation.noClass.students[username]
										if (classUser.permissions <= BANNED_PERMISSIONS) {
											logger.log('info', '[joinClass] User is banned')
											resolve('you are banned from that class')
											return
										}

										user.classPermissions = classUser.permissions

										// Remove student from old class
										delete classInformation.noClass.students[username]
										// Add the student to the newly created class
										classInformation[code].students[username] = user


										advancedEmitToClass('joinSound', code, { api: true })

										logger.log('verbose', `[joinClass] cD=(${classInformation})`)
										resolve(true)
									} else {
										database.run('INSERT INTO classusers(classId, studentId, permissions, digiPogs) VALUES(?, ?, ?, ?)',
											[classroom.id, user.id, classInformation[code].permissions.userDefaults, 0], (err) => {
												try {
													if (err) {
														reject(err)
														return
													}

													logger.log('info', '[joinClass] Added user to classusers')

													let user = classInformation.noClass.students[username]
													user.classPermissions = classInformation[code].permissions.userDefaults

													// Remove student from old class
													delete classInformation.noClass.students[username]
													// Add the student to the newly created class
													classInformation[code].students[username] = user
													logger.log('verbose', `[joinClass] cD=(${classInformation})`)
													resolve(true)
												} catch (err) {
													reject(err)
												}
											}
										)
									}
								} catch (err) {
									reject(err)
								}
							})
						} catch (err) {
							reject(err)
						}
					})
				} catch (err) {
					reject(err)
				}
			})
		} catch (err) {
			reject(err)
		}
	})
}

function camelCaseToNormal(str) {
	let result = str.replace(/([A-Z])/g, " $1")
	result = result.charAt(0).toUpperCase() + result.slice(1)
	return result
}

function runQuery(query, params) {
	return new Promise((resolve, reject) => {
		database.run(query, params, (err) => {
			if (err) reject(new Error(err))
			else resolve()
		})
	})
}

function getAll(query, params) {
	return new Promise((resolve, reject) => {
		database.all(query, params, (err, rows) => {
			if (err) reject(new Error(err))
			else resolve(rows)
		})
	})
}

/**
 * Sets the class code for all sockets in a specific API.
 * If no class code is provided, the default value is 'noClass'.
 *
 * @param {string} api - The API identifier.
 * @param {string} [classCode='noClass'] - The class code to set.
 */
async function setClassOfApiSockets(api, classCode) {
	logger.log('verbose', `[setClassOfApiSockets] api=(${api}) classCode=(${classCode})`);

	let sockets = await io.in(`api-${api}`).fetchSockets()

	for (let socket of sockets) {
		socket.leave(`class-${socket.request.session.class}`)

		socket.request.session.class = classCode || 'noClass'
		socket.request.session.save()

		socket.join(`class-${socket.request.session.class}`)

		socket.emit('setClass', socket.request.session.class)
	}
}

async function getIpAccess(type) {
	const ipList = await getAll(`SELECT id, ip FROM ip_${type}`)
	return ipList.reduce((ips, ip) => {
		ips[ip.id] = ip
		return ips
	}, {})
}

// Import routes
const apiRoutes = require('./routes/api.js')(classInformation)
const routeFiles = fs.readdirSync('./routes/').filter(file => file.endsWith('.js'));

for (const routeFile of routeFiles) {
	// Skip for now as it's already handled
	if (routeFile == "api.js") {
		continue;
	}

	const route = require(`./routes/${routeFile}`);
	route.run(app, io);
}

// Add routes to express
app.use('/api', apiRoutes)

// An endpoint for the teacher to control the formbar
// Used to update students permissions, handle polls and their corresponsing responses
// On render it will send all students in that class to the page
app.get('/controlPanel', isAuthenticated, permCheck, (req, res) => {
	try {
		logger.log('info', `[get /controlPanel] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

		let students = classInformation[req.session.class].students
		let keys = Object.keys(students)
		let allStuds = []

		for (var i = 0; i < keys.length; i++) {
			var val = { name: keys[i], perms: students[keys[i]].permissions, pollRes: { lettRes: students[keys[i]].pollRes.buttonRes, textRes: students[keys[i]].pollRes.textRes }, help: students[keys[i]].help }
			allStuds.push(val)
		}

		/* Uses EJS to render the template and display the information for the class.
		This includes the class list of students, poll responses, and the class code - Riley R., May 22, 2023
		*/
		res.render('pages/controlPanel', {
			title: 'Control Panel',
			pollStatus: classInformation[req.session.class].poll.status,
			settingsPermissions: classInformation[req.session.class].permissions.manageClass,
			tagNames: classInformation[req.session.class].tagNames
		})
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

// C

/*
Manages the use of excell spreadsheets in order to create progressive lessons.
It uses Excel To JSON to create an object containing all the data needed for a progressive lesson.
Could use a switch if need be, but for now it's all broken up by if statements.
Use the provided template when testing things. - Riley R., May 22, 2023
*/
app.post('/controlPanel', upload.single('spreadsheet'), isAuthenticated, permCheck, (req, res) => {
	try {
		//Initialze a list to push each step to - Riley R., May 22, 2023
		let steps = []

		logger.log('info', `[post /controlPanel] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

		/*
		Uses Excel to JSON to read the sent excel spreadsheet.
		Each main column has been assigned a label in order to differentiate them.
		It loops through the whole object - Riley R., May 22, 2023
		*/
		if (req.file) {
			classInformation[req.session.class].currentStep = 0
			const result = excelToJson({
				sourceFile: req.file.path,
				sheets: [{
					name: 'Steps',
					columnToKey: {
						A: 'index',
						B: 'type',
						C: 'prompt',
						D: 'response',
						E: 'labels'
					}
				}]
			})

			/* For In Loop that iterates through the created object.
			 Allows for the use of steps inside of a progressive lesson.
			 Checks the object's type using a conditional - Riley R., May 22, 2023
			*/
			for (const key in result['Steps']) {
				let step = {}
				// Creates an object with all the data required to start a poll - Riley R., May 22, 2023
				if (result['Steps'][key].type == 'Poll') {
					step.type = 'poll'
					step.labels = result['Steps'][key].labels.split(', ')
					step.responses = result['Steps'][key].response
					step.prompt = result['Steps'][key].prompt
					steps.push(step)
					// Creates an object with all the data required to start a quiz
				} else if (result['Steps'][key].type == 'Quiz') {
					let nameQ = result['Steps'][key].prompt
					let letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
					let colToKeyObj = {
						A: 'index',
						B: 'question',
						C: 'key'
					}
					let i = 0
					/*
					Names the cells of the sheet after C to A-Z for the use of them in Quizzes (A, B, and C in the spreadsheet are the index, question, and key, not the answers)
					Creates a way to have multiple responses to quizzes- Riley R., May 22, 2023
					*/
					for (const letterI in letters) {
						if (letters.charAt(letterI) != 'A' && letters.charAt(letterI) != 'B' && letters.charAt(letterI) != 'C') {
							colToKeyObj[letters.charAt(letterI)] = letters.charAt(i)
							i++
						}
					}
					let quizLoad = excelToJson({
						sourceFile: req.file.path,
						sheets: [{
							name: nameQ,
							columnToKey: colToKeyObj
						}]
					})
					let questionList = []
					for (let i = 1; i < quizLoad[nameQ].length; i++) {
						let questionMaker = []

						questionMaker.push(quizLoad[nameQ][i].question)
						questionMaker.push(quizLoad[nameQ][i].key)
						for (const letterI in letters) {
							if (quizLoad[nameQ][i][letters.charAt(letterI)] != undefined) {
								questionMaker.push(quizLoad[nameQ][i][letters.charAt(letterI)])
							}
						}
						questionList.push(questionMaker)
					}
					step.type = 'quiz'
					step.questions = questionList
					steps.push(step)
				} else if (result['Steps'][key].type == 'Lesson') {
					/*
					Creates an object with all necessary data in order to make a lesson.
					The data is stored on a page in an excel spreadsheet.
					the name of this page is defined in the main page of the excel spreadsheet. - Riley R., May 22, 2023
					*/
					nameL = result['Steps'][key].prompt
					let lessonLoad = excelToJson({
						sourceFile: req.file.path,
						sheets: [{
							name: nameL,
							columnToKey: {
								A: 'header',
								B: 'data'
							}
						}]
					})
					let lessonArr = []
					for (let i = 1; i < lessonLoad[nameL].length; i++) {
						let lessonMaker = [lessonLoad[nameL][i].header]

						let lessonContent = lessonLoad[nameL][i].data.split(', ')
						for (let u = 0; u < lessonContent.length; u++) {
							lessonMaker.push(lessonContent[u])
						}
						lessonArr.push(lessonMaker)
					}

					let dateConfig = new Date()

					step.type = 'lesson'
					step.date = `${dateConfig.getMonth() + 1}/${dateConfig.getDate()}/${dateConfig.getFullYear()}`
					step.lesson = lessonArr
					steps.push(step)
				}
			}

			classInformation[req.session.class].steps = steps
			res.redirect('/controlPanel')
		}
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

// Allow teacher to create class
// Allowing the teacher to create classes is vital to whether the lesson actually works or not, because they have to be allowed to create a teacher class
// This will allow the teacher to give students student perms, and guests student perms as well
// Plus they can ban and kick as long as they can create classes
app.post('/createClass', isLoggedIn, permCheck, (req, res) => {
	try {
		let submittionType = req.body.submittionType
		let className = req.body.name
		let classId = req.body.id

		logger.log('info', `[post /createClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
		logger.log('verbose', `[post /createClass] submittionType=(${submittionType}) className=(${className}) classId=(${classId})`)

		async function makeClass(id, className, key, permissions, sharedPolls = [], pollHistory = [], tags) {
			try {
				// Get the teachers session data ready to transport into new class
				var user = classInformation.noClass.students[req.session.username]

				logger.log('verbose', `[makeClass] id=(${id}) name=(${className}) key=(${key}) sharedPolls=(${JSON.stringify(sharedPolls)})`)
				// Remove teacher from no class
				delete classInformation.noClass.students[req.session.username]

				if (Object.keys(permissions).sort().toString() != Object.keys(DEFAULT_CLASS_PERMISSIONS).sort().toString()) {
					for (let permission of Object.keys(permissions)) {
						if (!DEFAULT_CLASS_PERMISSIONS[permission]) {
							delete permissions[permission]
						}
					}

					for (let permission of Object.keys(DEFAULT_CLASS_PERMISSIONS)) {
						if (!permissions[permission]) {
							permissions[permission] = DEFAULT_CLASS_PERMISSIONS[permission]
						}
					}
					database.run('UPDATE classroom SET permissions=? WHERE key=?', [JSON.stringify(permissions), key], (err) => {
						if (err) logger.log('error', err.stack)
					})
				}
				classInformation[key] = new Classroom(id, className, key, permissions, sharedPolls, pollHistory, tags)
				// Add the teacher to the newly created class
				classInformation[key].students[req.session.username] = user
				classInformation[key].students[req.session.username].classPermissions = MANAGER_PERMISSIONS

				// Add class into the session data
				req.session.class = key

				await setClassOfApiSockets(user.API, key)

				return true
			} catch (err) {
				return err
			}
		}

		// Checks if teacher is creating a new class or joining an old class
		//generates a 4 character key
		//this is used for students who want to enter a class
		if (submittionType == 'create') {
			let key = ''
			for (let i = 0; i < 4; i++) {
				let keygen = 'abcdefghijklmnopqrstuvwxyz123456789'
				let letter = keygen[Math.floor(Math.random() * keygen.length)]
				key += letter
			}

			// Add classroom to the database
			database.run('INSERT INTO classroom(name, owner, key, permissions, tags) VALUES(?, ?, ?, ?, ?)', [className, req.session.userId, key, JSON.stringify(DEFAULT_CLASS_PERMISSIONS), null], (err) => {
				try {
					if (err) throw err

					logger.log('verbose', '[post /createClass] Added classroom to database')

					database.get('SELECT id, name, key, permissions, tags FROM classroom WHERE name = ? AND owner = ?', [className, req.session.userId], async (err, classroom) => {
						try {
							if (err) throw err

							if (!classroom.id) {
								logger.log('critical', 'Class does not exist')
								res.render('pages/message', {
									message: 'Class does not exist (Please contact the programmer)',
									title: 'Login'
								})
								return
							}

							let makeClassStatus = await makeClass(
								classroom.id,
								classroom.name,
								classroom.key,
								JSON.parse(classroom.permissions),
								[],
								classroom.tags
							);

							if (makeClassStatus instanceof Error) throw makeClassStatus

							res.redirect('/')
						} catch (err) {
							logger.log('error', err.stack);
							res.render('pages/message', {
								message: `Error Number ${logNumbers.error}: There was a server error try again.`,
								title: 'Error'
							})
						}
					})
				} catch (err) {
					logger.log('error', err.stack);
					res.render('pages/message', {
						message: `Error Number ${logNumbers.error}: There was a server error try again.`,
						title: 'Error'
					})
				}
			})
		} else {
			database.get("SELECT classroom.id, classroom.name, classroom.key, classroom.permissions, classroom.tags, (CASE WHEN class_polls.pollId IS NULL THEN json_array() ELSE json_group_array(DISTINCT class_polls.pollId) END) as sharedPolls, (SELECT json_group_array(json_object('id', poll_history.id, 'class', poll_history.class, 'data', poll_history.data, 'date', poll_history.date)) FROM poll_history WHERE poll_history.class = classroom.id ORDER BY poll_history.date) as pollHistory FROM classroom LEFT JOIN class_polls ON class_polls.classId = classroom.id WHERE classroom.id = ?", [classId], async (err, classroom) => {
				try {
					if (err) throw err

					if (!classroom) {
						logger.log('critical', 'Class does not exist')
						res.render('pages/message', {
							message: 'Class does not exist (Please contact the programmer)',
							title: 'Login'
						})
						return
					}

					classroom.permissions = JSON.parse(classroom.permissions)
					classroom.sharedPolls = JSON.parse(classroom.sharedPolls)
					classroom.pollHistory = JSON.parse(classroom.pollHistory)

					if (classroom.tags) classroom.tags = classroom.tags.split(",");
					else classroom.tags = [];

					for (let poll of classroom.pollHistory) {
						poll.data = JSON.parse(poll.data)
					}

					if (classroom.pollHistory[0]) {
						if (classroom.pollHistory[0].id == null)
							classroom.pollHistory = null
					}

					let makeClassStatus = await makeClass(
						classroom.id,
						classroom.name,
						classroom.key,
						classroom.permissions,
						classroom.sharedPolls,
						classroom.pollHistory,
						classroom.tags
					)

					if (makeClassStatus instanceof Error) throw makeClassStatus

					res.redirect('/')
				} catch (err) {
					logger.log('error', err.stack);
					res.render('pages/message', {
						message: `Error Number ${logNumbers.error}: There was a server error try again.`,
						title: 'Error'
					})
				}
			})
		}
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

// L
// This renders the login page
// It displays the title and the color of the login page of the formbar js
// It allows for the login to check if the user wants to login to the server
// This makes sure the lesson can see the students and work with them
app.get('/login', (req, res) => {
	try {
		logger.log('info', `[get /login] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

		res.render('pages/login', {
			title: 'Login'
		})
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

// This lets the user log into the server, it uses each element from the database to allow the server to do so
// This lets users actually log in instead of not being able to log in at all
// It uses the usernames, passwords, etc. to verify that it is the user that wants to log in logging in
// This also encrypts passwords to make sure people's accounts don't get hacked
app.post('/login', async (req, res) => {
	try {
		var user = {
			username: req.body.username,
			password: req.body.password,
			loginType: req.body.loginType,
			userType: req.body.userType,
			displayName: req.body.displayName
		}
		var passwordCrypt = encrypt(user.password)

		logger.log('info', `[post /login] ip=(${req.ip}) session=(${JSON.stringify(req.session)}`)
		logger.log('verbose', `[post /login] username=(${user.username}) password=(${Boolean(user.password)}) loginType=(${user.loginType}) userType=(${user.userType})`)

		// Check whether user is logging in or signing up
		if (user.loginType == 'login') {
			logger.log('verbose', '[post /login] User is logging in')

			// Get the users login in data to verify password
			database.get('SELECT users.*, CASE WHEN shared_polls.pollId IS NULL THEN json_array() ELSE json_group_array(DISTINCT shared_polls.pollId) END as sharedPolls, CASE WHEN custom_polls.id IS NULL THEN json_array() ELSE json_group_array(DISTINCT custom_polls.id) END as ownedPolls FROM users LEFT JOIN shared_polls ON shared_polls.userId = users.id LEFT JOIN custom_polls ON custom_polls.owner = users.id WHERE users.username=?', [user.username], async (err, userData) => {
				try {
					// Check if a user with that name was not found in the database
					if (!userData.username) {
						logger.log('verbose', '[post /login] User does not exist')
						res.render('pages/message', {
							message: 'No user found with that username.',
							title: 'Login'
						})
						return
					}

					if (!userData.displayName) {
						database.run("UPDATE users SET displayName = ? WHERE username = ?", [userData.username, userData.username]), (err) => {
							try {
								if (err) throw err;
								logger.log('verbose', '[post /login] Added displayName to database');
							} catch (err) {
								logger.log('error', err.stack);
								res.render('pages/message', {
									message: `Error Number ${logNumbers.error}: There was a server error try again.`,
									title: 'Error'
								});
							};
						};
					};

					// Decrypt users password
					let tempPassword = decrypt(JSON.parse(userData.password))
					if (tempPassword != user.password) {
						logger.log('verbose', '[post /login] Incorrect password')
						res.render('pages/message', {
							message: 'Incorrect password',
							title: 'Login'
						})
						return
					}

					let loggedIn = false
					let classKey = ''

					for (let classData of Object.values(classInformation)) {
						if (classData.key) {
							for (let username of Object.keys(classData.students)) {
								if (username == userData.username) {
									loggedIn = true
									classKey = classData.key

									break
								}
							}
						}
					}

					if (loggedIn) {
						logger.log('verbose', '[post /login] User is already logged in')
						req.session.class = classKey
					} else {
						// Add user to the session
						classInformation.noClass.students[userData.username] = new Student(
							userData.username,
							userData.id,
							userData.permissions,
							userData.API,
							JSON.parse(userData.ownedPolls),
							JSON.parse(userData.sharedPolls),
							userData.tags,
							userData.displayName

						)
						req.session.class = 'noClass'
					}
					// Add a cookie to transfer user credentials across site
					req.session.userId = userData.id
					req.session.username = userData.username
					req.session.tags = userData.tags
					req.session.displayName = userData.displayName

					logger.log('verbose', `[post /login] session=(${JSON.stringify(req.session)})`)
					logger.log('verbose', `[post /login] cD=(${JSON.stringify(classInformation)})`)

					res.redirect('/')
				} catch (err) {
					logger.log('error', err.stack);
					res.render('pages/message', {
						message: `Error Number ${logNumbers.error}: There was a server error try again.`,
						title: 'Error'
					})
				}
			})
		} else if (user.loginType == 'new') {
			logger.log('verbose', '[post /login] Creating new user')

			let permissions = STUDENT_PERMISSIONS

			database.all('SELECT API, secret, username FROM users', (err, users) => {
				try {
					if (err) throw err

					let existingAPIs = []
					let existingSecrets = []
					let newAPI
					let newSecret

					if (users.length == 0) permissions = MANAGER_PERMISSIONS

					for (let dbUser of users) {
						existingAPIs.push(dbUser.API)
						existingSecrets.push(dbUser.secret)
						if (dbUser.username == user.username) {
							logger.log('verbose', '[post /login] User already exists')
							res.render('pages/message', {
								message: 'A user with that username already exists.',
								title: 'Login'
							})
							return
						}
					}

					do {
						newAPI = crypto.randomBytes(64).toString('hex')
					} while (existingAPIs.includes(newAPI))
					do {
						newSecret = crypto.randomBytes(256).toString('hex')
					} while (existingSecrets.includes(newSecret))

					// Add the new user to the database
					database.run(
						'INSERT INTO users(username, password, permissions, API, secret, displayName) VALUES(?, ?, ?, ?, ?, ?)',
						[
							user.username,
							JSON.stringify(passwordCrypt),
							permissions,
							newAPI,
							newSecret,
							user.displayName
						], (err) => {
							try {
								if (err) throw err

								logger.log('verbose', '[post /login] Added user to database')

								// Find the user in which was just created to get the id of the user
								database.get('SELECT * FROM users WHERE username=?', [user.username], (err, userData) => {
									try {
										if (err) throw err

										// Add user to session
										classInformation.noClass.students[userData.username] = new Student(
											userData.username,
											userData.id,
											userData.permissions,
											userData.API,
											[],
											[],
											userData.tags,
											userData.displayName
										)

										// Add the user to the session in order to transfer data between each page
										req.session.userId = userData.id
										req.session.username = userData.username
										req.session.class = 'noClass'
										req.session.displayName = userData.displayName;

										logger.log('verbose', `[post /login] session=(${JSON.stringify(req.session)})`)
										logger.log('verbose', `[post /login] cD=(${JSON.stringify(classInformation)})`)

										managerUpdate()

										res.redirect('/')
									} catch (err) {
										logger.log('error', err.stack);
										res.render('pages/message', {
											message: `Error Number ${logNumbers.error}: There was a server error try again.`,
											title: 'Error'
										})
									}
								})
							} catch (err) {
								logger.log('error', err.stack);
								res.render('pages/message', {
									message: `Error Number ${logNumbers.error}: There was a server error try again.`,
									title: 'Error'
								})
							}
						}
					)
				} catch (err) {
					logger.log('error', err.stack);
					res.render('pages/message', {
						message: `Error Number ${logNumbers.error}: There was a server error try again.`,
						title: 'Error'
					})
				}
			})
		} else if (user.loginType == 'guest') {
			logger.log('verbose', '[post /login] Logging in as guest')
		}
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

// M
// Loads which classes the teacher is an owner of
// This allows the teacher to be in charge of all classes
// The teacher can give any perms to anyone they desire, which is useful at times
// This also allows the teacher to kick or ban if needed
app.get('/manageClass', isLoggedIn, permCheck, (req, res) => {
	try {
		logger.log('info', `[get /manageClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
		logger.log('verbose', `[get /manageClass] currentUser=(${JSON.stringify(classInformation[req.session.class].students[req.session.username])})`)

		// Finds all classes the teacher is the owner of
		res.render('pages/manageClass', {
			title: 'Create Class',
		})
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

app.get('/managerPanel', isLoggedIn, permCheck, (req, res) => {
	try {
		logger.log('info', `[get /managerPanel] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

		res.render('pages/managerPanel', {
			title: 'Manager Panel'
		})
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

// N

// O
/* This is what happens when the server tries to authenticate a user. It saves the redirectURL query parameter to a variable, and sends the redirectURL to the oauth page as
a variable. */
app.get('/oauth', (req, res) => {
	try {
		let redirectURL = req.query.redirectURL

		logger.log('info', `[get /oauth] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
		logger.log('verbose', `[get /oauth] redirectURL=(${redirectURL})`)

		res.render('pages/oauth.ejs', {
			title: 'Oauth',
			redirectURL: redirectURL
		})
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

// This is what happens after the user submits their authentication data.
app.post('/oauth', (req, res) => {
	try {
		// It saves the username, password, and the redirectURL that is submitted.
		const {
			username,
			password,
			redirectURL
		} = req.body

		logger.log('info', `[post /oauth] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
		logger.log('verbose', `[post /oauth] username=(${username}) redirectURL=(${redirectURL})`)

		if (!username) {
			res.render('pages/message', {
				message: 'Please enter a username',
				title: 'Login'
			})
			return
		}
		if (!password) {
			res.render('pages/message', {
				message: 'Please enter a password',
				title: 'Login'
			})
			return
		}

		database.get('SELECT * FROM users WHERE username=?', [username], (err, userData) => {
			try {
				if (err) throw err

				// Check if a user with that name was not found in the database
				if (!userData.username) {
					logger.log('verbose', '[post /oauth] User does not exist')
					res.render('pages/message', {
						message: 'No user found with that username.',
						title: 'Login'
					})
					return
				}

				// Decrypt users password
				let databasePassword = decrypt(JSON.parse(userData.password))
				if (databasePassword != password) {
					logger.log('verbose', '[post /oauth] Incorrect password')
					res.render('pages/message', {
						message: 'Incorrect password',
						title: 'Login'
					})
					return
				}

				let classCode = getUserClass(userData.username)

				userData.classPermissions = null

				if (classInformation[classCode] && classInformation[classCode].students[userData.username])
					userData.classPermissions = classInformation[classCode].students[userData.username].classPermissions

				var token = jwt.sign({
					id: userData.id,
					username: userData.username,
					permissions: userData.permissions,
					classPermissions: userData.classPermissions,
					class: classCode
				}, userData.secret, { expiresIn: '30m' })

				logger.log('verbose', '[post /oauth] Successfully Logged in with oauth')
				res.redirect(`${redirectURL}?token=${token}`)
			} catch (err) {
				logger.log('error', err.stack);
				res.render('pages/message', {
					message: `Error Number ${logNumbers.error}: There was a server error try again.`,
					title: 'Error'
				})
			}
		})
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

// P
/* Allows the user to view previous lessons created, they are stored in the database- Riley R., May 22, 2023 */
app.get('/previousLessons', isAuthenticated, permCheck, (req, res) => {
	try {
		logger.log('info', `[get /previousLessons] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

		database.all('SELECT * FROM lessons WHERE class=?', classInformation[req.session.class].className, async (err, lessons) => {
			try {
				if (err) throw err

				logger.log('verbose', `[get /previousLessons] rows=(${JSON.stringify(lessons)})`)

				res.render('pages/previousLesson', {
					rows: lessons,
					title: 'Previous Lesson'
				})
			} catch (err) {
				logger.log('error', err.stack);
				res.render('pages/message', {
					message: `Error Number ${logNumbers.error}: There was a server error try again.`,
					title: 'Error'
				})
			}
		})
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

app.post('/previousLessons', isAuthenticated, permCheck, (req, res) => {
	try {
		let lesson = JSON.parse(req.body.data)

		logger.log('info', `[post /previousLessons] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

		res.render('pages/lesson', {
			lesson: lesson,
			title: "Today's Lesson"
		})
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

app.get('/plugins', isAuthenticated, permCheck, (req, res) => {
	try {
		logger.log('info', `[get /plugins] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

		res.render('pages/plugins.ejs', {
			title: 'Plugins'
		})
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

// Q



// R


// S
app.get('/selectClass', isLoggedIn, permCheck, (req, res) => {
	try {
		logger.log('info', `[get /selectClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

		database.all(
			'SELECT classroom.name, classroom.key FROM users JOIN classusers ON users.id = classusers.studentId JOIN classroom ON classusers.classId = classroom.id WHERE users.username=?',
			[req.session.username],
			(err, joinedClasses) => {
				try {
					if (err) throw err

					logger.log('verbose', `[get /selectClass] joinedClasses=(${JSON.stringify(joinedClasses)})`)
					res.render('pages/selectClass', {
						title: 'Select Class',
						joinedClasses: joinedClasses
					})
				} catch (err) {
					logger.log('error', err.stack);
					res.render('pages/message', {
						message: `Error Number ${logNumbers.error}: There was a server error try again.`,
						title: 'Error'
					})
				}
			}
		)
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})


//Adds user to a selected class, typically from the select class page
app.post('/selectClass', isLoggedIn, permCheck, async (req, res) => {
	try {
		let classCode = req.body.key.toLowerCase()

		logger.log('info', `[post /selectClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)}) classCode=(${classCode})`)

		let classJoinStatus = await joinClass(req.session.username, classCode)

		if (typeof classJoinStatus == 'string') {
			res.render('pages/message', {
				message: `Error: ${classJoinStatus}`,
				title: 'Error'
			})
			return
		}

		let classData = classInformation[classCode]

		let cpPermissions = Math.min(
			classData.permissions.controlPolls,
			classData.permissions.manageStudents,
			classData.permissions.manageClass
		)

		advancedEmitToClass('cpUpdate', classCode, { classPermissions: cpPermissions }, classInformation[classCode])

		req.session.class = classCode

		setClassOfApiSockets(classInformation[classCode].students[req.session.username].API, classCode)

		res.redirect('/')
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})


/* Student page, the layout is controlled by different "modes" to display different information.
There are currently 3 working modes
Poll: For displaying a multiple choice or essay question
Quiz: Displaying a quiz with questions that can be answered by the student
Lesson: used to display an agenda of sorts to the stufent, but really any important info can be put in a lesson - Riley R., May 22, 2023
*/
app.get('/student', isAuthenticated, permCheck, (req, res) => {
	try {
		//Poll Setup
		let user = {
			name: req.session.username,
			class: req.session.class,
			tags: req.session.tags
		}
		let answer = req.query.letter

		logger.log('info', `[get /student] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
		logger.log('verbose', `[get /student] question=(${JSON.stringify(req.query.question)}) answer=(${req.query.letter})`)

		if (answer) {
			classInformation[req.session.class].students[req.session.username].pollRes.buttonRes = answer
		}

		//Quiz Setup and Queries
		/* Sets up the query parameters you can enter when on the student page. These return either a question by it's index or a question by a randomly generated index.

		formbar.com/students?question=random or formbar.com/students?question=[number] are the params you can enter at the current moment.

		If you did not enter a query the page will be loaded normally. - Riley R., May 24, 2023
		*/
		if (req.query.question == 'random') {
			let random = Math.floor(Math.random() * classInformation[req.session.class].quiz.questions.length)

			logger.log('verbose', `[get /student] quiz=(${JSON.stringify(classInformation[req.session.class].quiz.questions[random])})`)

			res.render('pages/queryquiz', {
				quiz: JSON.stringify(classInformation[req.session.class].quiz.questions[random]),
				title: 'Quiz'
			})
			if (classInformation[req.session.class].quiz.questions[req.query.question] != undefined) {
				logger.log('verbose', `[get /student] quiz=(${JSON.stringify(classInformation[req.session.class].quiz.questions[req.query.question])})`)

				res.render('pages/queryquiz', {
					quiz: JSON.stringify(classInformation[req.session.class].quiz.questions[random]),
					title: 'Quiz'
				})
			}
		} else if (isNaN(req.query.question) == false) {
			if (typeof classInformation[req.session.class].quiz.questions[req.query.question] != 'undefined') {
				logger.log('verbose', `[get /student] quiz=(${JSON.stringify(classInformation[req.session.class].quiz.questions[req.query.question])})`)

				res.render('pages/queryquiz', {
					quiz: JSON.stringify(classInformation[req.session.class].quiz.questions[req.query.question]),
					title: 'Quiz'
				})
			} else {
				res.render('pages/message', {
					message: 'Error: please enter proper data',
					title: 'Error'
				})
			}
		} else if (typeof req.query.question == 'undefined') {
			logger.log('verbose', `[get /student] user=(${JSON.stringify(user)}) myRes = (cD[req.session.class].students[req.session.username].pollRes.buttonRes) myTextRes = (cD[req.session.class].students[req.session.username].pollRes.textRes) lesson = (cD[req.session.class].lesson)`)

			res.render('pages/student', {
				title: 'Student',
				user: JSON.stringify(user),
				myRes: classInformation[req.session.class].students[req.session.username].pollRes.buttonRes,
				myTextRes: classInformation[req.session.class].students[req.session.username].pollRes.textRes,
				lesson: classInformation[req.session.class].lesson
			})
		}
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

/* This is for when you send poll data via a post command or when you submit a quiz.
If it's a poll it'll save your response to the student object and the database.
- Riley R., May 24, 2023
*/
app.post('/student', isAuthenticated, permCheck, (req, res) => {
	try {
		logger.log('info', `[post /student] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
		logger.log('verbose', `[post /student] poll=(${JSON.stringify(req.query.poll)}) question=(${JSON.stringify(req.body.question)})`)

		if (req.query.poll) {
			let answer = req.body.poll
			if (answer) {
				classInformation[req.session.class].students[req.session.username].pollRes.buttonRes = answer
			}
			res.redirect('/poll')
		}
		if (req.body.question) {
			let results = req.body.question
			let totalScore = 0
			for (let i = 0; i < classInformation[req.session.class].quiz.questions.length; i++) {
				if (results[i] == classInformation[req.session.class].quiz.questions[i][1]) {
					totalScore += classInformation[req.session.class].quiz.pointsPerQuestion
				} else {
					continue
				}
			}
			classInformation[req.session.class].students[req.session.username].quizScore = Math.floor(totalScore) + '/' + classInformation[req.session.class].quiz.totalScore


			let user = structuredClone(classInformation[req.session.class].students[req.session.username])
			delete user.API
			logger.log('verbose', `[post /student] user=(${JSON.stringify(user)}) totalScore=(${totalScore})`)

			res.render('pages/results', {
				totalScore: Math.floor(totalScore),
				maxScore: classInformation[req.session.class].quiz.totalScore,
				title: 'Results'
			})
		}
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

// 404
app.use((req, res, next) => {
	try {
		// Defines users desired endpoint
		let urlPath = req.url
		// Checks if url has a / in it and removes it from the string
		if (urlPath.indexOf('/') != -1) {
			urlPath = urlPath.slice(urlPath.indexOf('/') + 1)
		}
		// Check for ?(urlParams) and removes it from the string
		if (urlPath.indexOf('?') != -1) {
			urlPath = urlPath.slice(0, urlPath.indexOf('?'))
		}

		logger.log('warning', `[404] urlPath=(${urlPath}) ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

		if (urlPath.startsWith('/api/')) {
			res.status(404).json({ error: `The page ${urlPath} does not exist` })
		} else {
			res.status(404).render('pages/message', {
				message: `Error: the page ${urlPath} does not exist`,
				title: 'Error'
			})
		}
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

http.listen(420, async () => {
	whitelistedIps = await getIpAccess('whitelist')
	blacklistedIps = await getIpAccess('blacklist')
	console.log('Running on port: 420')
	logger.log('info', 'Start')
})
