// Imported modules
const express = require('express')
const session = require('express-session') //For storing client login data
const { encrypt, decrypt } = require('./static/js/crypto.js') //For encrypting passwords
const sqlite3 = require('sqlite3').verbose()
const jwt = require('jsonwebtoken') //For authentication system between Plugins and Formbar
const excelToJson = require('convert-excel-to-json')
const multer = require('multer')//Used to upload files
const upload = multer({ dest: 'uploads/' }) //Selects a file destination for uploaded files to go to, will create folder when file is submitted(?)
const crypto = require('crypto')
const winston = require('winston')
const fs = require("fs");

var app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)

// Set EJS as our view engine
app.set('view engine', 'ejs')


// Create session for user information to be transferred from page to page
var sessionMiddleware = session({
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

const jsonLogData = fs.readFileSync("logNumbers.json");
var logNumbers = JSON.parse(jsonLogData);

// Establishes the connection to the database file
var db = new sqlite3.Database('database/database.db')
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
				var logNumbersString = JSON.stringify(logNumbers);
				fs.writeFileSync("logNumbers.json", logNumbersString);
				return `[${timestamp}] ${level} - Error Number ${logNumbers.error}: ${message}`;
			} else {
				return `[${timestamp}] ${level}: ${message}`
			}
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

//cD is the class dictionary, it stores all of the information on classes and students
var cD = {
	noClass: { students: {} }
}


// Constants
// permissions levels
const MANAGER_PERMISSIONS = 5
const TEACHER_PERMISSIONS = 4
const MOD_PERMISSIONS = 3
const STUDENT_PERMISSIONS = 2
const GUEST_PERMISSIONS = 1
const BANNED_PERMISSIONS = 0

// Permission level needed to access each page
const PAGE_PERMISSIONS = {
	controlPanel: { permissions: MOD_PERMISSIONS, classPage: true },
	previousLessons: { permissions: TEACHER_PERMISSIONS, classPage: true },
	student: { permissions: STUDENT_PERMISSIONS, classPage: true },
	virtualbar: { permissions: GUEST_PERMISSIONS, classPage: true },
	makeQuiz: { permissions: TEACHER_PERMISSIONS, classPage: true },
	plugins: { permissions: STUDENT_PERMISSIONS, classPage: true },
	manageClass: { permissions: TEACHER_PERMISSIONS, classPage: false },
	createClass: { permissions: TEACHER_PERMISSIONS, classPage: false },
	selectClass: { permissions: GUEST_PERMISSIONS, classPage: false },
	// managerPanel: { permissions: MANAGER_PERMISSIONS, classPage: false }
}

const PASSIVE_SOCKETS = [
	'pollUpdate',
	'modeUpdate',
	'quizUpdate',
	'lessonUpdate',
	'vbUpdate',
	'cpUpdate',
	'joinRoom',
	'leaveRoom',
	'pluginUpdate',
	'customPollUpdate',
	'bannedStudentsUpdate'
]

const GLOBAL_SOCKET_PERMISSIONS = {
	permChange: MANAGER_PERMISSIONS,
	deleteClass: TEACHER_PERMISSIONS,
	getOwnedClasses: TEACHER_PERMISSIONS,
	logout: GUEST_PERMISSIONS,
	getUserClass: GUEST_PERMISSIONS,
	saveTags: TEACHER_PERMISSIONS
}

const CLASS_SOCKET_PERMISSIONS = {
	help: STUDENT_PERMISSIONS,
	pollResp: STUDENT_PERMISSIONS,
	requestBreak: STUDENT_PERMISSIONS,
	endBreak: STUDENT_PERMISSIONS,
	pollUpdate: STUDENT_PERMISSIONS,
	modeUpdate: STUDENT_PERMISSIONS,
	quizUpdate: STUDENT_PERMISSIONS,
	lessonUpdate: STUDENT_PERMISSIONS,
	vbUpdate: GUEST_PERMISSIONS,
	leaveClass: GUEST_PERMISSIONS,
	joinRoom: GUEST_PERMISSIONS,
	leaveRoom: GUEST_PERMISSIONS,
	cpUpdate: MOD_PERMISSIONS,
	previousPollDisplay: TEACHER_PERMISSIONS,
	pluginUpdate: STUDENT_PERMISSIONS,
	setClassPermissionSetting: MANAGER_PERMISSIONS
}

// make a better name for this
const CLASS_SOCKET_PERMISSION_SETTINGS = {
	startPoll: 'controlPolls',
	clearPoll: 'controlPolls',
	endPoll: 'controlPolls',
	customPollUpdate: 'controlPolls',
	savePoll: 'controlPolls',
	deletePoll: 'controlPolls',
	setPublicPoll: 'controlPolls',
	sharePollToUser: 'controlPolls',
	removeUserPollShare: 'controlPolls',
	getPollShareIds: 'controlPolls',
	sharePollToClass: 'controlPolls',
	removeClassPollShare: 'controlPolls',
	doStep: 'controlPolls',
	classPermChange: 'manageStudents',
	deleteStudent: 'manageStudents',
	deleteStudents: 'manageStudents',
	approveBreak: 'breakAndHelp',
	deleteTicket: 'breakAndHelp',
	changePlugin: 'manageClass',
	addPlugin: 'manageClass',
	removePlugin: 'manageClass',
	endClass: 'manageClass',
	modechange: 'manageClass',
	bannedStudentsUpdate: 'manageStudents',
	banStudent: 'manageStudents',
	unbanStudent: 'manageStudents'
}

const DEFAULT_CLASS_PERMISSIONS = {
	games: MOD_PERMISSIONS,
	controlPolls: MOD_PERMISSIONS,
	manageStudents: TEACHER_PERMISSIONS,
	breakAndHelp: MOD_PERMISSIONS,
	manageClass: TEACHER_PERMISSIONS
}


// This class is used to create a student to be stored in the sessions data
class Student {
	// Needs username, id from the database, and if permissions established already pass the updated value
	// These will need to be put into the constructor in order to allow the creation of the object
	constructor(
		username,
		id,
		permissions = STUDENT_PERMISSIONS,
		API,
		ownedPolls = [],
		sharedPolls = [],
		tags
	) {
		this.username = username
		this.id = id
		this.permissions = permissions
		this.classPermissions = null
		this.tags = tags
		this.ownedPolls = ownedPolls || []
		this.sharedPolls = sharedPolls || []
		this.pollRes = {
			buttonRes: '',
			textRes: ''
		}
		this.help = false
		this.break = false
		this.quizScore = ''
		this.API = API
		this.pogMeter = 0
	}
}


// This class is used to add a new classroom to the session data
// The classroom will be used to add lessons, do lessons, and for the teacher to operate them
class Classroom {
	// Needs the name of the class you want to create
	constructor(id, className, key, permissions, sharedPolls = []) {
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
			blind: false
		}
		this.key = key
		this.lesson = {}
		this.activeLesson = false
		this.steps
		this.currentStep = 0
		this.quiz = false
		this.mode = 'poll'
		this.permissions = permissions
	}
}

//allows quizzes to be made
class Quiz {
	constructor(numOfQuestions, maxScore) {
		this.questions = []
		this.totalScore = maxScore
		this.numOfQuestions = numOfQuestions
		this.pointsPerQuestion = this.totalScore / numOfQuestions
	}
}

//allows lessons to be made
class Lesson {
	constructor(date, content) {
		this.date = date
		this.content = content
	}
}

// Functions
// Global functions
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

function joinClass(username, code) {
	return new Promise((resolve, reject) => {
		try {
			logger.log('info', `[joinClass] username=(${username}) classCode=(${code})`)

			// Find the id of the class from the database
			db.get('SELECT id FROM classroom WHERE key=?', [code], (err, classroom) => {
				try {
					if (err) {
						reject(err)
						return
					}

					// Check to make sure there was a class with that code
					if (!classroom || !cD[code]) {
						logger.log('info', '[joinClass] No open class with that code')
						resolve('no open class with that code')
						return
					}

					// Find the id of the user who is trying to join the class
					db.get('SELECT id FROM users WHERE username=?', [username], (err, user) => {
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
							db.get('SELECT * FROM classusers WHERE classId = ? AND studentId = ?',
								[classroom.id, user.id],
								(err, classUser) => {
									try {
										if (err) {
											reject(err)
											return
										}

										if (classUser) {
											// Get the student's session data ready to transport into new class
											let user = cD.noClass.students[username]
											if (classUser.permissions <= BANNED_PERMISSIONS) {
												logger.log('info', '[joinClass] User is banned')
												resolve('you are banned from that class')
												return
											}

											user.classPermissions = classUser.permissions

											// Remove student from old class
											delete cD.noClass.students[username]
											// Add the student to the newly created class
											cD[code].students[username] = user
											logger.log('verbose', `[joinClass] cD=(${cD})`)
											resolve(true)
										} else {
											db.run('INSERT INTO classusers(classId, studentId, permissions, digiPogs) VALUES(?, ?, ?, ?)',
												[classroom.id, user.id, GUEST_PERMISSIONS, 0], (err) => {
													try {
														if (err) {
															reject(err)
															return
														}

														logger.log('info', '[joinClass] Added user to classusers')

														let user = cD.noClass.students[username]
														user.classPermissions = GUEST_PERMISSIONS

														// Remove student from old class
														delete cD.noClass.students[username]
														// Add the student to the newly created class
														cD[code].students[username] = user
														logger.log('verbose', `[joinClass] cD=(${cD})`)
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
								}
							)
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

// Express functions
/*
Check if user has logged in
Place at the start of any page that needs to verify if a user is logged in or not
This allows websites to check on their own if the user is logged in
This also allows for the website to check for permissions
*/
function isAuthenticated(req, res, next) {
	try {
		logger.log('info', `[isAuthenticated] url=(${req.url}) ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

		if (req.session.username) {
			if (cD.noClass.students[req.session.username]) {
				if (cD.noClass.students[req.session.username].permissions >= TEACHER_PERMISSIONS) {
					res.redirect('/manageClass')
				} else {
					res.redirect('/selectClass')
				}
			} else {
				next()
			}
		} else {
			res.redirect('/login')
		}
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
}

// Check if user is logged in. Only used for create and select class pages
// Use isAuthenticated function for any other pages
// Created for the first page since there is no check before this
// This allows for a first check in where the user gets checked by the webpage
function isLoggedIn(req, res, next) {
	try {
		logger.log('info', `[isLoggedIn] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
		if (req.session.username) {
			next()
		} else {
			res.redirect('/login')
		}
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
}

// Check if user has the permission levels to enter that page
function permCheck(req, res, next) {
	try {
		let username = req.session.username
		let classCode = req.session.class

		logger.log('info', `[permCheck] ip=(${req.ip}) session=(${JSON.stringify(req.session)}) url=(${req.url})`)

		if (req.url) {
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

			if (!cD[classCode].students[username]) {
				req.session.class = 'noClass'
				classCode = 'noClass'
			}

			logger.log('verbose', `[permCheck] urlPath=(${urlPath})`)
			if (!PAGE_PERMISSIONS[urlPath]) {
				logger.log('info', `[permCheck] ${urlPath} is not in the page permissions`)
				res.render('pages/message', {
					message: `Error: ${urlPath} is not in the page permissions`,
					title: 'Error'
				})
			}

			// Checks if users permissions are high enough
			if (
				PAGE_PERMISSIONS[urlPath].classPage &&
				cD[classCode].students[username].classPermissions >= PAGE_PERMISSIONS[urlPath].permissions
			) {
				next()
			} else if (
				!PAGE_PERMISSIONS[urlPath].classPage &&
				cD[classCode].students[username].permissions >= PAGE_PERMISSIONS[urlPath].permissions
			) {
				next()
			} else {
				logger.log('info', '[permCheck] Not enough permissions')
				res.render('pages/message', {
					message: `Error: you don't have high enough permissions to access ${urlPath}`,
					title: 'Error'
				})
			}
		}
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
}


//import routes
const apiRoutes = require('./routes/api.js')(cD)

//add routes to express
app.use('/api', apiRoutes)


// This is the root page, it is where the users first get checked by the home page
// It is used to redirect to the home page
// This allows it to check if the user is logged in along with the home page
// It also allows for redirection to any other page if needed
app.get('/', isAuthenticated, (req, res) => {
	try {
		logger.log('info', `[get /] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
		// if (cD[req.session.class].students[req.session.username].classPermissions >= MANAGER_PERMISSIONS) {
		// 	res.redirect('/managerPanel')
		if (cD[req.session.class].students[req.session.username].classPermissions >= TEACHER_PERMISSIONS) {
			res.redirect('/controlPanel')
		} else {
			res.redirect('/student')
		}
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})


// A
//The page displaying the API key used when handling oauth2 requests from outside programs such as formPix
app.get('/apikey', isAuthenticated, (req, res) => {
	try {
		logger.log('info', `[get /apikey] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

		res.render('pages/apiKey', {
			title: 'API Key',
			API: cD[req.session.class].students[req.session.username].API
		})
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

// B

// C


// An endpoint for the teacher to control the formbar
// Used to update students permissions, handle polls and their corresponsing responses
// On render it will send all students in that class to the page
app.get('/controlPanel', isAuthenticated, permCheck, (req, res) => {
	try {
		logger.log('info', `[get /controlPanel] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

		let students = cD[req.session.class].students
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
			pollStatus: cD[req.session.class].poll.status,
			currentUser: JSON.stringify(cD[req.session.class].students[req.session.username]),
			settingsPermissions: cD[req.session.class].permissions.manageClass,
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
			cD[req.session.class].currentStep = 0
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

			cD[req.session.class].steps = steps
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

app.get('/managerPanel', isAuthenticated, permCheck, (req, res) => {
	try {
		logger.log('info', `[get /managerPanel] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

		let students = cD[req.session.class].students
		let keys = Object.keys(students)
		let allStuds = []

		for (var i = 0; i < keys.length; i++) {
			var val = { name: keys[i], perms: students[keys[i]].permissions, pollRes: { lettRes: students[keys[i]].pollRes.buttonRes, textRes: students[keys[i]].pollRes.textRes }, help: students[keys[i]].help }
			allStuds.push(val)
		}

		/* Uses EJS to render the template and display the information for the class.
		This includes the class list of students, poll responses, and the class code - Riley R., May 22, 2023
		*/
		res.render('pages/managerPanel', {
			title: 'Manager Panel',
			pollStatus: cD[req.session.class].poll.status,
			currentUser: JSON.stringify(cD[req.session.class].students[req.session.username])
		})
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

		function makeClass(id, className, key, permissions, sharedPolls = []) {
			try {
				// Get the teachers session data ready to transport into new class
				var user = cD.noClass.students[req.session.username]

				logger.log('verbose', `[makeClass] id=(${id}) name=(${className}) key=(${key}) sharedPolls=(${JSON.stringify(sharedPolls)})`)
				// Remove teacher from no class
				delete cD.noClass.students[req.session.username]

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
					db.run('UPDATE classroom SET permissions = ? WHERE key = ?', [JSON.stringify(permissions), key], (err) => {
						if (err) logger.log('error', err.stack)
					})
				}
				cD[key] = new Classroom(id, className, key, permissions, sharedPolls)
				// Add the teacher to the newly created class
				cD[key].students[req.session.username] = user
				cD[key].students[req.session.username].classPermissions = MANAGER_PERMISSIONS

				// Add class into the session data
				req.session.class = key

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
			db.run('INSERT INTO classroom(name, owner, key, permissions) VALUES(?, ?, ?, ?)', [className, req.session.userId, key, JSON.stringify(DEFAULT_CLASS_PERMISSIONS)], (err) => {
				try {
					if (err) throw err

					logger.log('verbose', `[post /createClass] Added classroom to database`)

					db.get('SELECT classroom.id, classroom.name, classroom.key, classroom.permissions, NULLIF(json_group_array(DISTINCT class_polls.pollId), "[null]") as sharedPolls FROM classroom LEFT JOIN class_polls ON class_polls.classId = classroom.id WHERE classroom.name = ? AND classroom.owner = ?', [className, req.session.userId], (err, classroom) => {
						try {
							if (err) throw err

							if (!classroom.id) {
								logger.log('critical', `Class does not exist`)
								res.render('pages/message', {
									message: 'Class does not exist (Please contact the programmer)',
									title: 'Login'
								})
								return
							}

							let makeClassStatus = makeClass(
								classroom.id,
								classroom.name,
								classroom.key,
								JSON.parse(classroom.permissions),
								JSON.parse(classroom.sharedPolls)
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
				} catch (err) {
					logger.log('error', err.stack);
					res.render('pages/message', {
						message: `Error Number ${logNumbers.error}: There was a server error try again.`,
						title: 'Error'
					})
				}
			})
		} else {
			db.get('SELECT id, name, key, permissions FROM classroom WHERE id = ?', [classId], (err, classroom) => {
				try {
					if (err) throw err

					if (!classroom) {
						logger.log('critical', `Class does not exist`)
						res.render('pages/message', {
							message: 'Class does not exist (Please contact the programmer)',
							title: 'Login'
						})
						return
					}

					let makeClassStatus = makeClass(
						classroom.id,
						classroom.name,
						classroom.key,
						JSON.parse(classroom.permissions)
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

// D

// E

// F

// G

// H

// I

// J

// K

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
			userType: req.body.userType
		}
		var passwordCrypt = encrypt(user.password)

		logger.log('info', `[post /login] ip=(${req.ip}) session=(${JSON.stringify(req.session)}`)
		logger.log('verbose', `[post /login] username=(${user.username}) password=(${Boolean(user.password)}) loginType=(${user.loginType}) userType=(${user.userType})`)

		// Check whether user is logging in or signing up
		if (user.loginType == 'login') {
			logger.log('verbose', `[post /login] User is logging in`)

			// Get the users login in data to verify password
			db.get('SELECT users.*, CASE WHEN shared_polls.pollId IS NULL THEN json_array() ELSE json_group_array(DISTINCT shared_polls.pollId) END as sharedPolls, CASE WHEN custom_polls.id IS NULL THEN json_array() ELSE json_group_array(DISTINCT custom_polls.id) END as ownedPolls FROM users LEFT JOIN shared_polls ON shared_polls.userId = users.id LEFT JOIN custom_polls ON custom_polls.owner = users.id WHERE users.username = ?', [user.username], async (err, userData) => {
				try {
					// Check if a user with that name was not found in the database
					if (!userData.username) {
						logger.log('verbose', `[post /login] User does not exist`)
						res.render('pages/message', {
							message: 'No user found with that username.',
							title: 'Login'
						})
						return
					}

					// Decrypt users password
					let tempPassword = decrypt(JSON.parse(userData.password))
					if (tempPassword != user.password) {
						logger.log('verbose', `[post /login] Incorrect password`)
						res.render('pages/message', {
							message: 'Incorrect password',
							title: 'Login'
						})
						return
					}

					let loggedIn = false
					let classKey = ''

					for (let classData of Object.values(cD)) {
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
						logger.log('verbose', `[post /login] User is already logged in`)
						req.session.class = classKey
					} else {
						// Add user to the session
						cD.noClass.students[userData.username] = new Student(
							userData.username,
							userData.id,
							userData.permissions,
							userData.API,
							JSON.parse(userData.ownedPolls),
							JSON.parse(userData.sharedPolls),
							userData.tags

						)
						req.session.class = 'noClass'
					}
					// Add a cookie to transfer user credentials across site
					req.session.userId = userData.id
					req.session.username = userData.username

					logger.log('verbose', `[post /login] session=(${JSON.stringify(req.session)})`)
					logger.log('verbose', `[post /login] cD=(${JSON.stringify(cD)})`)

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
			logger.log('verbose', `[post /login] Creating new user`)

			let permissions = STUDENT_PERMISSIONS

			db.all('SELECT API, secret, username FROM users', (err, users) => {
				try {
					if (err) throw err

					let existingAPIs = []
					let existingSecrets = []
					let newAPI
					let newSecret

					if (users.length == 0) permissions = TEACHER_PERMISSIONS

					for (let dbUser of users) {
						existingAPIs.push(dbUser.API)
						existingSecrets.push(dbUser.secret)
						if (dbUser.username == user.username) {
							logger.log('verbose', `[post /login] User already exists`)
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
					db.run(
						'INSERT INTO users(username, password, permissions, API, secret) VALUES(?, ?, ?, ?, ?)',
						[
							user.username,
							JSON.stringify(passwordCrypt),
							permissions,
							newAPI,
							newSecret
						], (err) => {
							try {
								if (err) throw err

								logger.log('verbose', `[post /login] Added user to database`)

								// Find the user in which was just created to get the id of the user
								db.get('SELECT * FROM users WHERE username=?', [user.username], (err, userData) => {
									try {
										if (err) throw err

										// Add user to session
										cD.noClass.students[userData.username] = new Student(
											userData.username,
											userData.id,
											userData.permissions,
											userData.API,
											JSON.parse(userData.ownedPolls),
											JSON.parse(userData.sharedPolls),
											userData.tags
										)

										// Add the user to the session in order to transfer data between each page
										req.session.userId = userData.id
										req.session.username = userData.username
										req.session.class = 'noClass'

										logger.log('verbose', `[post /login] session=(${JSON.stringify(req.session)})`)
										logger.log('verbose', `[post /login] cD=(${JSON.stringify(cD)})`)

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
			logger.log('verbose', `[post /login] Logging in as guest`)
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
		logger.log('verbose', `[get /manageClass] currentUser=(${JSON.stringify(cD[req.session.class].students[req.session.username])})`)

		// Finds all classes the teacher is the owner of
		res.render('pages/manageClass', {
			title: 'Create Class',
			currentUser: JSON.stringify(cD[req.session.class].students[req.session.username])
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

		// If there is a username and password submitted, then it gets results from the database that match the username.
		if (username && password) {
			db.get('SELECT * FROM users WHERE username = ?', [username], (err, userData) => {
				try {
					if (err) throw err

					// Check if a user with that name was not found in the database
					if (!userData.username) {
						logger.log('verbose', `[post /oauth] User does not exist`)
						res.render('pages/message', {
							message: 'No user found with that username.',
							title: 'Login'
						})
						return
					}

					// Decrypt users password
					let databasePassword = decrypt(JSON.parse(userData.password))
					if (databasePassword != password) {
						logger.log('verbose', `[post /oauth] Incorrect password`)
						res.render('pages/message', {
							message: 'Incorrect password',
							title: 'Login'
						})
						return
					}

					// If it matches, a token is generated, and the page redirects to the specified redirectURL using the token as a query parameter.
					var token = jwt.sign({ username: userData.username, permissions: userData.permissions }, userData.secret, { expiresIn: '30m' })

					logger.log('verbose', `[post /oauth] Successfully Logged in with oauth`)

					res.redirect(`${redirectURL}?token=${token}`)
				} catch (err) {
					logger.log('error', err.stack);
					res.render('pages/message', {
						message: `Error Number ${logNumbers.error}: There was a server error try again.`,
						title: 'Error'
					})
				}
			})
			// If either a username, password, or both is not returned, then it redirects back to the oauth page.
		} else res.redirect(`/oauth?redirectURL=${redirectURL}`)
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

		db.all('SELECT * FROM lessons WHERE class=?', cD[req.session.class].className, async (err, lessons) => {
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

		db.all(
			'SELECT classroom.name, classroom.key FROM users JOIN classusers ON users.id = classusers.studentId JOIN classroom ON classusers.classId = classroom.id WHERE users.username = ?',
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
		let code = req.body.key.toLowerCase()

		logger.log('info', `[post /selectClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)}) classCode=(${code})`)

		let classJoinStatus = await joinClass(req.session.username, code)

		if (typeof classJoinStatus == 'string') {
			res.render('pages/message', {
				message: `Error: ${classJoinStatus}`,
				title: 'Error'
			})
			return
		}

		req.session.class = code
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
			class: req.session.class
		}
		let answer = req.query.letter

		logger.log('info', `[get /student] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
		logger.log('verbose', `[get /student] question=(${JSON.stringify(req.query.question)}) answer=(${req.query.letter})`)

		if (answer) {
			cD[req.session.class].students[req.session.username].pollRes.buttonRes = answer
		}

		//Quiz Setup and Queries
		/* Sets up the query parameters you can enter when on the student page. These return either a question by it's index or a question by a randomly generated index.

		formbar.com/students?question=random or formbar.com/students?question=[number] are the params you can enter at the current moment.

		If you did not enter a query the page will be loaded normally. - Riley R., May 24, 2023
		*/
		if (req.query.question == 'random') {
			let random = Math.floor(Math.random() * cD[req.session.class].quiz.questions.length)

			logger.log('verbose', `[get /student] quiz=(${JSON.stringify(cD[req.session.class].quiz.questions[random])})`)

			res.render('pages/queryquiz', {
				quiz: JSON.stringify(cD[req.session.class].quiz.questions[random]),
				title: 'Quiz'
			})
			if (cD[req.session.class].quiz.questions[req.query.question] != undefined) {
				logger.log('verbose', `[get /student] quiz=(${JSON.stringify(cD[req.session.class].quiz.questions[req.query.question])})`)

				res.render('pages/queryquiz', {
					quiz: JSON.stringify(cD[req.session.class].quiz.questions[random]),
					title: 'Quiz'
				})
			}
		} else if (isNaN(req.query.question) == false) {
			if (typeof cD[req.session.class].quiz.questions[req.query.question] != 'undefined') {
				logger.log('verbose', `[get /student] quiz=(${JSON.stringify(cD[req.session.class].quiz.questions[req.query.question])})`)

				res.render('pages/queryquiz', {
					quiz: JSON.stringify(cD[req.session.class].quiz.questions[req.query.question]),
					title: 'Quiz'
				})
			} else {
				res.render('pages/message', {
					message: 'Error: please enter proper data',
					title: 'Error'
				})
			}
		} else if (typeof req.query.question == 'undefined') {
			logger.log('verbose', `[get /student] user=(${JSON.stringify(user)}) myRes=(cD[req.session.class].students[req.session.username].pollRes.buttonRes) myTextRes=(cD[req.session.class].students[req.session.username].pollRes.textRes) lesson=(cD[req.session.class].lesson)`)

			res.render('pages/student', {
				title: 'Student',
				user: JSON.stringify(user),
				myRes: cD[req.session.class].students[req.session.username].pollRes.buttonRes,
				myTextRes: cD[req.session.class].students[req.session.username].pollRes.textRes,
				lesson: cD[req.session.class].lesson
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
				cD[req.session.class].students[req.session.username].pollRes.buttonRes = answer
			}
			res.redirect('/poll')
		}
		if (req.body.question) {
			let results = req.body.question
			let totalScore = 0
			for (let i = 0; i < cD[req.session.class].quiz.questions.length; i++) {
				if (results[i] == cD[req.session.class].quiz.questions[i][1]) {
					totalScore += cD[req.session.class].quiz.pointsPerQuestion
				} else {
					continue
				}
			}
			cD[req.session.class].students[req.session.username].quizScore = Math.floor(totalScore) + '/' + cD[req.session.class].quiz.totalScore


			let user = structuredClone(cD[req.session.class].students[req.session.username])
			delete user.API
			logger.log('verbose', `[post /student] user=(${JSON.stringify(user)}) totalScore=(${totalScore})`)

			res.render('pages/results', {
				totalScore: Math.floor(totalScore),
				maxScore: cD[req.session.class].quiz.totalScore,
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


// T

// U

// V
app.get('/virtualbar', isAuthenticated, permCheck, (req, res) => {
	try {
		logger.log('info', `[get /virtualbar] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
		logger.log('verbose', `[get /virtualbar] className=(${JSON.stringify(cD[req.session.class].className)})`)

		res.render('pages/virtualbar', {
			title: 'Virtual Bar',
			className: cD[req.session.class].className
		})
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
})

// W

// X

// Y

// Z

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
		if (urlPath.startsWith('api/')) {
			res.status(404).json(`Error: the page ${urlPath} does not exist`)
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


// Middleware for sockets
// Authentication for users and plugins to connect to formbar websockets
// The user must be logged in order to connect to websockets
io.use((socket, next) => {
	try {
		let { api } = socket.request.headers

		logger.log('info', `[socket authentication] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)}) api=(${api})`)

		if (socket.request.session.username) {
			next()
		} else if (api) {
			db.get(
				'SELECT id, username, permissions FROM users WHERE API = ?',
				[api],
				(err, userData) => {
					try {
						if (err) throw err
						if (!userData) {
							logger.log('verbose', '[socket authentication] not a valid API Key')
							next(new Error('Not a valid API key'))
							return
						}

						socket.request.session.api = api
						socket.request.session.class = 'noClass'

						next()
					} catch (err) {
						logger.log('error', err.stack);
					}
				}
			)
		} else {
			logger.log('info', '[socket authentication] Missing username or api')
			next(new Error('Missing API key'))
		}
	} catch (err) {
		logger.log('error', err.stack);
	}
})

let rateLimits = {}

let userSockets = {}

//Handles the websocket communications
io.on('connection', (socket) => {
	try {
		if (socket.request.session.username) {
			socket.join(socket.request.session.class)
			socket.join(socket.request.session.username)

			userSockets[socket.request.session.username] = socket
		}
		if (socket.request.session.api) {
			socket.join(socket.request.session.class)
		}
	} catch (err) {
		logger.log('error', err.stack);
	}

	function cpUpdate(classCode = socket.request.session.class) {
		try {
			logger.log('info', `[cpUpdate] classCode=(${classCode})`)

			db.all('SELECT * FROM poll_history WHERE class = ?', cD[classCode].id, async (err, rows) => {
				try {
					var pollHistory = rows

					for (let poll of pollHistory) {
						poll.data = JSON.parse(poll.data)
					}

					logger.log('verbose', `[cpUpdate] classData=(${JSON.stringify(cD[classCode])}) pollHistory=(${JSON.stringify(pollHistory)})`)

					io.to(classCode).emit('cpUpdate', cD[classCode], pollHistory)
				} catch (err) {
					logger.log('error', err.stack);
				}
			})
		} catch (err) {
			logger.log('error', err.stack);
		}
	}

	function vbUpdate(classCode = socket.request.session.class) {
		try {
			logger.log('info', `[vbUpdate] classCode=(${classCode})`)

			if (!classCode) return
			if (classCode == 'noClass') return

			let classData = structuredClone(cD[classCode])
			let responses = {}

			for (let [username, student] of Object.entries(classData.students)) {
				if (student.break == true || student.classPermissions >= TEACHER_PERMISSIONS) delete classData.students[username]
			}

			if (Object.keys(classData.poll.responses).length > 0) {
				for (let [resKey, resValue] of Object.entries(classData.poll.responses)) {
					responses[resKey] = {
						...resValue,
						responses: 0
					}
				}

				for (let studentData of Object.values(classData.students)) {
					if (
						studentData &&
						Object.keys(responses).includes(studentData.pollRes.buttonRes)
					)
						responses[studentData.pollRes.buttonRes].responses++
				}
			}

			logger.log('verbose', `[vbUpdate] status=(${classData.poll.status}) totalStudents=(${Object.keys(classData.students).length}) polls=(${JSON.stringify(responses)}) textRes=(${classData.poll.textRes}) prompt=(${classData.poll.prompt}) weight=(${classData.poll.weight}) blind=(${classData.poll.blind})`)

			io.to(classCode).emit('vbUpdate', {
				status: classData.poll.status,
				totalStudents: Object.keys(classData.students).length,
				polls: responses,
				textRes: classData.poll.textRes,
				prompt: classData.poll.prompt,
				weight: classData.poll.weight,
				blind: classData.poll.blind
			})
		} catch (err) {
			logger.log('error', err.stack);
		}
	}

	function pollUpdate(classCode = socket.request.session.class) {
		try {
			logger.log('info', `[pollUpdate] classCode=(${classCode})`)
			logger.log('verbose', `[pollUpdate] poll=(${JSON.stringify(cD[classCode].poll)})`)

			io.to(classCode).emit('pollUpdate', cD[socket.request.session.class].poll)
		} catch (err) {
			logger.log('error', err.stack);
		}
	}

	function modeUpdate(classCode = socket.request.session.class) {
		try {
			logger.log('info', `[modeUpdate] classCode=(${classCode})`)
			logger.log('verbose', `[modeUpdate] mode=(${cD[classCode].mode})`)

			io.to(classCode).emit('modeUpdate', cD[socket.request.session.class].mode)
		} catch (err) {
			logger.log('error', err.stack);
		}
	}

	function quizUpdate(classCode = socket.request.session.class) {
		try {
			logger.log('info', `[quizUpdate] classCode=(${classCode})`)
			logger.log('verbose', `[quizUpdate] quiz=(${JSON.stringify(cD[classCode].quiz)})`)

			io.to(classCode).emit('quizUpdate', cD[socket.request.session.class].quiz)
		} catch (err) {
			logger.log('error', err.stack);
		}
	}

	function lessonUpdate(classCode = socket.request.session.class) {
		try {
			logger.log('info', `[lessonUpdate] classCode=(${classCode})`)
			logger.log('verbose', `[lessonUpdate] lesson=(${JSON.stringify(cD[classCode].lesson)})`)

			io.to(classCode).emit('lessonUpdate', cD[socket.request.session.class].lesson)
		} catch (err) {
			logger.log('error', err.stack);
		}
	}

	function pluginUpdate(classCode = socket.request.session.class) {
		try {
			logger.log('info', `[pluginUpdate] classCode=(${classCode})`)

			db.all(
				'SELECT plugins.id, plugins.name, plugins.url FROM plugins JOIN classroom ON classroom.key = ?',
				[classCode],
				(err, plugins) => {
					try {
						if (err) throw err

						logger.log('verbose', `[pluginUpdate] plugins=(${JSON.stringify(plugins)})`)

						io.to(classCode).emit('pluginUpdate', plugins)
					} catch (err) {
						logger.log('error', err.stack);
					}
				}
			)
		} catch (err) {
			logger.log('error', err.stack);
		}
	}

	function customPollUpdate(username) {
		try {
			logger.log('info', `[customPollUpdate] username=(${username})`)

			let userSession = userSockets[username].request.session

			let userSharedPolls = cD[userSession.class].students[userSession.username].sharedPolls
			let userOwnedPolls = cD[userSession.class].students[userSession.username].ownedPolls
			let userCustomPolls = Array.from(new Set(userSharedPolls.concat(userOwnedPolls)))
			let classroomPolls = structuredClone(cD[userSession.class].sharedPolls)
			let publicPolls = []
			let customPollIds = userCustomPolls.concat(classroomPolls)

			logger.log('verbose', `[customPollUpdate] userSharedPolls=(${userSharedPolls}) userOwnedPolls=(${userOwnedPolls}) userCustomPolls=(${userCustomPolls}) classroomPolls=(${classroomPolls}) publicPolls=(${publicPolls}) customPollIds=(${customPollIds})`)

			db.all(
				`SELECT * FROM custom_polls WHERE id IN (${customPollIds.map(() => '?').join(', ')}) OR public = 1 OR owner = ?`,
				[
					...customPollIds,
					userSession.userId
				],
				(err, customPollsData) => {
					try {
						if (err) throw err

						for (let customPoll of customPollsData) {
							customPoll.answers = JSON.parse(customPoll.answers)
						}

						customPollsData = customPollsData.reduce((newObject, customPoll) => {
							try {
								newObject[customPoll.id] = customPoll
								return newObject
							} catch (err) {
								logger.log('error', err.stack);
							}
						}, {})

						for (let customPoll of Object.values(customPollsData)) {
							if (customPoll.public) {
								publicPolls.push(customPoll.id)
							}
						}

						logger.log('verbose', `[customPollUpdate] publicPolls=(${publicPolls}) classroomPolls=(${classroomPolls}) userCustomPolls=(${userCustomPolls}) customPollsData=(${JSON.stringify(customPollsData)})`)

						io.to(username).emit(
							'customPollUpdate',
							publicPolls,
							classroomPolls,
							userCustomPolls,
							customPollsData
						)
					} catch (err) {
						logger.log('error', err.stack);
					}
				}
			)
		} catch (err) {
			logger.log('error', err.stack);
		}
	}

	function bannedStudentsUpdate(classCode = socket.request.session.class) {
		try {
			logger.log('info', `[bannedStudentsUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[bannedStudentsUpdate] classCode=(${classCode})`)

			if (!classCode || classCode == 'noClass') return

			db.all('SELECT users.username FROM classroom JOIN classusers ON classusers.classId = classroom.id AND classusers.permissions = 0 JOIN users ON users.id = classusers.studentId WHERE classusers.classId = ?', cD[socket.request.session.class].id, (err, bannedStudents) => {
				try {
					if (err) throw err

					bannedStudents = bannedStudents.map((bannedStudent) => bannedStudent.username)
					io.to(classCode).emit('bannedStudentsUpdate', bannedStudents)
				} catch (err) {
					logger.log('error', err.stack)
				}
			})
		} catch (err) {
			logger.log('error', err.stack)
		}
	}

	function deleteStudent(username, classCode = socket.request.session.class) {
		try {
			logger.log('info', `[deleteStudent] username=(${username}) classCode=(${classCode})`)

			userSockets[username].leave(cD[classCode].className)
			cD.noClass.students[username] = cD[classCode].students[username]
			cD.noClass.students[username].classPermissions = null
			userSockets[username].request.session.class = 'noClass'
			userSockets[username].request.session.save()
			delete cD[classCode].students[username]

			logger.log('verbose', `[deleteStudent] cD=(${JSON.stringify(cD)})`)

			io.to(username).emit('reload')
		} catch (err) {
			logger.log('error', err.stack);
		}
	}

	function deleteStudents(classCode) {
		try {
			logger.log('info', `[deleteStudents] classCode=(${classCode})`)

			for (let username of Object.keys(cD[classCode].students)) {
				if (cD[classCode].students[username].classPermissions < TEACHER_PERMISSIONS) {
					deleteStudent(username, classCode)
				}
			}
		} catch (err) {
			logger.log('error', err.stack);
		}
	}

	function endPoll() {
		try {
			logger.log('info', `[clearPoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

			let data = { prompt: '', names: [], letter: [], text: [] }

			let dateConfig = new Date()
			let date = `${dateConfig.getMonth() + 1}/${dateConfig.getDate()}/${dateConfig.getFullYear()}`

			data.prompt = cD[socket.request.session.class].poll.prompt

			for (const key in cD[socket.request.session.class].students) {
				data.names.push(cD[socket.request.session.class].students[key].username)
				data.letter.push(cD[socket.request.session.class].students[key].pollRes.buttonRes)
				data.text.push(cD[socket.request.session.class].students[key].pollRes.textRes)
			}

			db.run(
				'INSERT INTO poll_history(class, data, date) VALUES(?, ?, ?)',
				[cD[socket.request.session.class].id, JSON.stringify(data), date], (err) => {
					if (err) {
						logger.log('error', err.stack);
					} else logger.log('verbose', '[clearPoll] saved poll to history')
				}
			)


			cD[socket.request.session.class].poll.status = false

			logger.log('verbose', `[clearPoll] classData=(${JSON.stringify(cD[socket.request.session.class])})`)

			pollUpdate()
			vbUpdate()
			cpUpdate()
		} catch (err) {
			logger.log('error', err.stack);
		}
	}

	function endClass(classCode) {
		try {
			logger.log('info', `[endClass] classCode=(${classCode})`)

			for (let username of Object.keys(cD[classCode].students)) {
				deleteStudent(username, classCode)
			}
			delete cD[classCode]

			logger.log('verbose', `[endClass] cD=(${JSON.stringify(cD)})`)
			socket.broadcast.to(classCode).emit('classEnded')
		} catch (err) {
			logger.log('error', err.stack);
		}
	}

	function getOwnedClasses(username) {
		try {
			logger.log('info', `[getOwnedClasses] username=(${username})`)

			db.all('SELECT name, id FROM classroom WHERE owner=?',
				[userSockets[username].request.session.userId], (err, ownedClasses) => {
					try {
						if (err) throw err

						logger.log('info', `[getOwnedClasses] ownedClasses=(${JSON.stringify(ownedClasses)})`)

						io.to(username).emit('getOwnedClasses', ownedClasses)
					} catch (err) {
						logger.log('error', err.stack);
					}
				}
			)
		} catch (err) {
			logger.log('error', err.stack);
		}
	}

	function getPollShareIds(pollId) {
		try {
			logger.log('info', `[getPollShareIds] pollId=(${pollId})`)

			db.all(
				'SELECT pollId, userId, username FROM shared_polls LEFT JOIN users ON users.id = shared_polls.userId WHERE pollId = ?',
				pollId,
				(err, userPollShares) => {
					try {
						if (err) throw err

						db.all(
							'SELECT pollId, classId, name FROM class_polls LEFT JOIN classroom ON classroom.id = class_polls.classId WHERE pollId = ?',
							pollId,
							(err, classPollShares) => {
								try {
									if (err) throw err

									logger.log('info', `[getPollShareIds] userPollShares=(${JSON.stringify(userPollShares)}) classPollShares=(${JSON.stringify(classPollShares)})`)

									socket.emit('getPollShareIds', userPollShares, classPollShares)
								} catch (err) {
									logger.log('error', err.stack);
								}
							}
						)
					} catch (err) {

					}
				}
			)
		} catch (err) {
			logger.log('error', err.stack);
		}
	}

	//rate limiter
	socket.use((packet, next) => {
		try {
			const username = socket.request.session.username
			const currentTime = Date.now()
			const limit = 5
			const timeFrame = 5000
			const blockTime = 5000
			const limitedRequests = ['pollResp', 'help', 'break']

			logger.log('info', `[rate limiter] username=(${username}) currentTime=(${currentTime})`)

			if (!rateLimits[username]) {
				rateLimits[username] = {}
			}

			const userRequests = rateLimits[username]

			const requestType = packet[0]
			if (!limitedRequests.includes(requestType)) {
				next()
				return
			}

			userRequests[requestType] = userRequests[requestType] || []

			userRequests[requestType] = userRequests[requestType].filter((timestamp) => currentTime - timestamp < timeFrame)

			logger.log('verbose', `[rate limiter] userRequests=(${JSON.stringify(userRequests)})`)

			if (userRequests[requestType].length >= limit) {
				socket.emit('message', `You are being rate limited. Please try again in a ${blockTime / 1000} seconds.`)
				setTimeout(() => {
					try {
						userRequests[requestType].shift()
					} catch (err) {
						logger.log('error', err.stack);
					}
				}, blockTime)
			} else {
				userRequests[requestType].push(currentTime)
				next()
			}
		} catch (err) {
			logger.log('error', err.stack);
		}
	})

	//permission check
	socket.use((packet, next) => {
		try {
			const username = socket.request.session.username
			const classCode = socket.request.session.class
			const socketType = packet[0]

			if (
				GLOBAL_SOCKET_PERMISSIONS[socketType] &&
				cD[classCode].students[username].permissions >= GLOBAL_SOCKET_PERMISSIONS[socketType]
			) {
				next()
			} else if (
				CLASS_SOCKET_PERMISSIONS[socketType] &&
				cD[classCode].students[username].classPermissions >= CLASS_SOCKET_PERMISSIONS[socketType]
			) {
				next()
			} else if (
				CLASS_SOCKET_PERMISSION_SETTINGS[socketType] &&
				cD[classCode].permissions[CLASS_SOCKET_PERMISSION_SETTINGS[socketType]] &&
				cD[classCode].students[username].classPermissions >= cD[classCode].permissions[CLASS_SOCKET_PERMISSION_SETTINGS[socketType]]
			) {
				next()
			} else {
				if (!PASSIVE_SOCKETS.includes(socketType))
					socket.emit('message', `You do not have permission to use ${camelCaseToNormal(socketType)}.`)
			}
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	// /poll websockets for updating the database
	socket.on('pollResp', (res, textRes, resWeight, resLength) => {
		try {
			logger.log('info', `[pollResp] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[pollResp] res=(${res}) textRes=(${textRes}) resWeight=(${resWeight}) resLength=(${resLength})`)

			cD[socket.request.session.class].students[socket.request.session.username].pollRes.buttonRes = res
			cD[socket.request.session.class].students[socket.request.session.username].pollRes.textRes = textRes

			for (let i = 0; i < resLength; i++) {
				if (res) {
					let calcWeight = cD[socket.request.session.class].poll.weight * resWeight
					cD[socket.request.session.class].students[socket.request.session.username].pogMeter += calcWeight
					if (cD[socket.request.session.class].students[socket.request.session.username].pogMeter >= 25) {
						db.get('SELECT digipogs FROM classusers WHERE studentId = ?', [cD[socket.request.session.class].students[socket.request.session.username].id], (err, data) => {
							try {
								if (err) throw err

								db.run('UPDATE classusers SET digiPogs = ? WHERE studentId = ?', [data + 1, cD[socket.request.session.class].students[socket.request.session.username].id], (err) => {
									try {
										if (err) throw err

										logger.log('verbose', `[pollResp] Added 1 digipog to ${socket.request.session.username}`)
									} catch (err) {
										logger.log('error', err.stack);
									}
								})
							} catch (err) {
								logger.log('error', err.stack);
							}
						})
						cD[socket.request.session.class].students[socket.request.session.username].pogMeter = 0
					}
				}
			}
			logger.log('verbose', `[pollResp] user=(${cD[socket.request.session.class].students[socket.request.session.username]})`)

			cpUpdate()
			vbUpdate()
		} catch (err) {
			logger.log('error', err.stack);
		}
	})

	// Changes Permission of user. Takes which user and the new permission level
	socket.on('classPermChange', (user, newPerm) => {
		try {
			newPerm = Number(newPerm)

			logger.log('info', `[classPermChange] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[classPermChange] user=(${user}) newPerm=(${newPerm})`)

			cD[socket.request.session.class].students[user].classPermissions = newPerm

			db.run('UPDATE classusers SET permissions = ? WHERE classId = ? AND studentId = ?', [
				newPerm,
				cD[socket.request.session.class].id,
				cD[socket.request.session.class].students[user].id
			])

			logger.log('verbose', `[classPermChange] user=(${JSON.stringify(cD[socket.request.session.class].students[user])})`)
			io.to(user).emit('reload')

			cpUpdate()
		} catch (err) {
			logger.log('error', err.stack);
		}
	})

	socket.on('permChange', (user, newPerm) => {
		try {
			newPerm = Number(newPerm)

			logger.log('info', `[permChange] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[permChange] user=(${user}) newPerm=(${newPerm})`)

			cD[socket.request.session.class].students[user].permissions = newPerm
			db.run('UPDATE users SET permissions = ? WHERE username = ?', [newPerm, user])
		} catch (err) {
			logger.log('error', err.stack);
		}
	})

	// Starts a new poll. Takes the number of responses and whether or not their are text responses
	socket.on('startPoll', (resNumber, resTextBox, pollPrompt, polls, blind, weight) => {
		try {
			logger.log('info', `[startPoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[startPoll] resNumber=(${resNumber}) resTextBox=(${resTextBox}) pollPrompt=(${pollPrompt}) polls=(${JSON.stringify(polls)}) blind=(${blind}) weight=(${weight})`)

			let generatedColors = generateColors(resNumber)
			logger.log('verbose', `[pollResp] user=(${cD[socket.request.session.class].students[socket.request.session.username]})`)
			if (generatedColors instanceof Error) throw generatedColors

			cD[socket.request.session.class].mode = 'poll'
			cD[socket.request.session.class].poll.blind = blind
			cD[socket.request.session.class].poll.status = true

			// Creates an object for every answer possible the teacher is allowing
			for (let i = 0; i < resNumber; i++) {
				let letterString = 'abcdefghijklmnopqrstuvwxyz'
				let answer = letterString[i]
				let weight = 1
				let color = generatedColors[i]

				if (polls[i].answer)
					answer = polls[i].answer
				if (polls[i].weight)
					weight = polls[i].weight
				if (polls[i].color)
					color = polls[i].color

				cD[socket.request.session.class].poll.responses[answer] = {
					answer: answer,
					weight: weight,
					color: color
				}
			}

			cD[socket.request.session.class].poll.weight = weight
			cD[socket.request.session.class].poll.textRes = resTextBox
			cD[socket.request.session.class].poll.prompt = pollPrompt

			for (var key in cD[socket.request.session.class].students) {
				cD[socket.request.session.class].students[key].pollRes.buttonRes = ''
				cD[socket.request.session.class].students[key].pollRes.textRes = ''
			}

			logger.log('verbose', `[startPoll] classData=(${JSON.stringify(cD[socket.request.session.class])})`)

			pollUpdate()
			vbUpdate()
			cpUpdate()
			socket.emit('startPoll')
		} catch (err) {
			logger.log('error', err.stack);
		}
	})

	// End the current poll. Does not take any arguments
	socket.on('clearPoll', () => {
		try {
			endPoll()
			cD[socket.request.session.class].poll.responses = {}
			cD[socket.request.session.class].poll.prompt = ''
			cD[socket.request.session.class].poll = {
				status: false,
				responses: {},
				textRes: false,
				prompt: '',
				weight: 1,
				blind: false,

			}
			vbUpdate()
		} catch (err) {
			logger.log('error', err.stack);
		}
	})

	socket.on('endPoll', () => {
		try {
			endPoll()
		} catch (err) {
			logger.log('error', err.stack);
		}
	})


	socket.on('pollUpdate', () => {
		logger.log('info', `[pollUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

		pollUpdate()
	})

	socket.on('modeUpdate', () => {
		logger.log('info', `[modeUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

		modeUpdate()
	})

	socket.on('quizUpdate', () => {
		logger.log('info', `[quizUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

		quizUpdate()
	})

	socket.on('lessonUpdate', () => {
		logger.log('info', `[lessonUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

		lessonUpdate()
	})

	// Sends poll and student response data to client side virtual bar
	socket.on('vbUpdate', () => {
		logger.log('info', `[vbUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

		vbUpdate()
	})

	socket.on('customPollUpdate', () => {
		logger.log('info', `[customPollUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

		customPollUpdate(socket.request.session.username)
	})

	socket.on('savePoll', (poll, id) => {
		try {
			logger.log('info', `[savePoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[savePoll] poll=(${JSON.stringify(poll)}) id=(${id})`)

			let userId = socket.request.session.userId

			if (id) {
				db.get(`SELECT * FROM custom_polls WHERE id = ?`, [id], (err, poll) => {
					try {
						if (err) throw err

						if (userId != poll.owner) {
							socket.emit('message', 'You do not have permission to edit this poll.')
							return
						}

						db.run(`UPDATE custom_polls SET name = ?, prompt = ?, answers = ?, textRes = ?, blind = ?, weight = ?, public = ? WHERE id = ?`, [
							poll.name,
							poll.prompt,
							JSON.stringify(poll.answers),
							poll.textRes,
							poll.blind,
							poll.weight,
							poll.public,
							id
						], (err) => {
							try {
								if (err) throw err

								socket.emit('message', 'Poll saved successfully!')
								customPollUpdate(socket.request.session.username)
							} catch (err) {
								logger.log('error', err.stack);
							}
						})
					} catch (err) {
						logger.log('error', err.stack);
					}
				})
			} else {
				db.get('SELECT seq AS nextPollId from sqlite_sequence WHERE name = "custom_polls"', (err, nextPollId) => {
					try {
						if (err) throw err
						if (!nextPollId) logger.log('critical', '[savePoll] nextPollId not found')

						nextPollId = nextPollId.nextPollId + 1

						db.run('INSERT INTO custom_polls (owner, name, prompt, answers, textRes, blind, weight, public) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
							userId,
							poll.name,
							poll.prompt,
							JSON.stringify(poll.answers),
							poll.textRes,
							poll.blind,
							poll.weight,
							poll.public
						], (err) => {
							try {
								if (err) throw err

								cD[socket.request.session.class].students[socket.request.session.username].ownedPolls.push(nextPollId)
								socket.emit('message', 'Poll saved successfully!')
								customPollUpdate(socket.request.session.username)
							} catch (err) {
								logger.log('error', err.stack);
							}
						})
					} catch (err) {
						logger.log('error', err.stack);
					}
				})
			}
		} catch (err) {
			logger.log('error', err.stack);
		}
	})

	socket.on('deletePoll', (pollId) => {
		try {
			let userId = socket.request.session.userId

			logger.log('info', `[deletePoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)}) pollId=(${pollId})`)
			logger.log('info', `[deletePoll] pollId=(${pollId})`)

			if (!pollId) {
				socket.emit('message', 'No poll is selected.')
				return
			}

			db.get(`SELECT * FROM custom_polls WHERE id = ?`, pollId, async (err, poll) => {
				try {
					if (err) throw err

					logger.log('info', `[deletePoll] poll=(${JSON.stringify(poll)})`)

					if (userId != poll.owner) {
						logger.log('info', '[deletePoll] not owner')
						socket.emit('message', 'You do not have permission to delete this poll.')
						return
					}

					db.run('BEGIN TRANSACTION')

					await Promise.all([
						new Promise((resolve, reject) => {
							db.run('DELETE FROM custom_polls WHERE i = ?', pollId, (err) => {
								if (err) reject(err)
								else resolve()
							})
						}),
						new Promise((resolve, reject) => {
							db.run('DELETE FROM shared_polls WHERE pollId = ?', pollId, (err) => {
								if (err) reject(err)
								else resolve()
							})
						}),
						new Promise((resolve, reject) => {
							db.run('DELETE FROM class_polls WHERE pollId = ?', pollId, (err) => {
								if (err) reject(err)
								else resolve()
							})
						})
					]).catch(async (err) => {
						await new Promise((resolve, reject) => {
							db.run('ROLLBACK', (err) => {
								if (err) reject(err)
								else resolve()
							})
						})
						throw err
					})

					db.run('COMMIT')

					for (let classroom of Object.values(cD)) {
						let updatePolls = false

						if (classroom.sharedPolls) {
							if (classroom.sharedPolls.includes(pollId)) {
								classroom.sharedPolls.splice(classroom.sharedPolls.indexOf(pollId), 1)
								updatePolls = true
							}
						}

						for (let user of Object.values(classroom.students)) {
							if (user.sharedPolls.includes(pollId)) {
								user.sharedPolls.splice(user.sharedPolls.indexOf(pollId), 1)
								updatePolls = true
							}

							if (user.ownedPolls.includes(pollId)) {
								user.ownedPolls.splice(user.ownedPolls.indexOf(pollId), 1)
								updatePolls = true
							}

							if (updatePolls)
								customPollUpdate(user.username)
						}
					}

					logger.log('info', '[deletePoll] deleted')
					socket.emit('message', 'Poll deleted successfully!')
				} catch (err) {
					logger.log('error', err.stack);
				}
			})
		} catch (err) {
			logger.log('error', err.stack);
		}
	})

	socket.on('setPublicPoll', (pollId, value) => {
		try {
			logger.log('info', `[setPublicPoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[setPublicPoll] pollId=(${pollId}) value=(${value})`)

			db.run('UPDATE custom_polls set public = ? WHERE id = ?', [value, pollId], (err) => {
				try {
					if (err) throw err

					for (let userSocket of Object.values(userSockets)) {
						customPollUpdate(userSocket.request.session.username)
					}
				} catch (err) {
					logger.log('error', err.stack);
				}
			})
		} catch (err) {
			logger.log('error', err.stack);
		}
	})

	socket.on('sharePollToUser', (pollId, username) => {
		try {
			logger.log('info', `[sharePollToUser] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[sharePollToUser] pollId=(${pollId}) username=(${username})`)

			db.get('SELECT * FROM users WHERE username = ?', username, (err, user) => {
				try {
					if (err) throw err

					if (!user) {
						logger.log('info', 'User does not exist')
						socket.emit('message', 'User does not exist')
						return
					}

					db.get('SELECT * FROM custom_polls WHERE id = ?', pollId, (err, poll) => {
						try {
							if (err) throw err

							if (!poll) {
								logger.log('critical', 'Poll does not exist')
								socket.emit('message', 'Poll does not exist (Please contact the programmer)')
								return
							}

							let name = 'Unnamed Poll'
							if (poll.name) name = poll.name
							else if (poll.prompt) name = poll.prompt

							db.get(
								'SELECT * FROM shared_polls WHERE pollId = ? AND userId = ?',
								[pollId, user.id],
								(err, sharePoll) => {
									try {
										if (err) throw err

										if (sharePoll) {
											socket.emit('message', `${name} is Already Shared with ${username}`)
											return
										}

										db.run(
											'INSERT INTO shared_polls (pollId, userId) VALUES (?, ?)',
											[pollId, user.id],
											async (err) => {
												try {
													if (err) throw err

													socket.emit('message', `Shared ${name} with ${username}`)

													getPollShareIds(pollId)

													let classCode = getUserClass(username)

													if (classCode instanceof Error) throw classCode
													if (!classCode) return

													cD[classCode].students[user.username].sharedPolls.push(pollId)

													customPollUpdate(username)
												} catch (err) {
													logger.log('error', err.stack);
												}
											}
										)
									} catch (err) {
										logger.log('error', err.stack);
									}
								}
							)
						} catch (err) {
							logger.log('error', err.stack);
						}
					})
				} catch (err) {
					logger.log('error', err.stack);
				}
			})
		} catch (err) {
			logger.log('error', err.stack);
		}
	})

	socket.on('removeUserPollShare', (pollId, userId) => {
		try {
			logger.log('info', `[removeUserPollShare] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[removeUserPollShare] pollId=(${pollId}) userId=(${userId})`)

			db.get(
				'SELECT * FROM shared_polls WHERE pollId = ? AND userId = ?',
				[pollId, userId],
				(err, pollShare) => {
					try {
						if (err) throw err

						if (!pollShare) {
							logger.log('critical', '[removeUserPollShare] Poll is not shared to this user')
							socket.emit('message', 'Poll is not shared to this user')
							return
						}

						db.run(
							'DELETE FROM shared_polls WHERE pollId = ? AND userId = ?',
							[pollId, userId],
							(err) => {
								try {
									if (err) throw err

									socket.emit('message', 'Successfully unshared user')
									getPollShareIds(pollId)

									db.get('SELECT * FROM users WHERE id = ?', userId, async (err, user) => {
										try {
											if (err) throw err

											if (!user) {
												logger.log('critical', '[removeUserPollShare] User does not exist')
												socket.emit('message', 'User does not exist')
												return
											}

											let classCode = getUserClass(user.username)

											if (classCode instanceof Error) throw classCode
											if (!classCode) return

											let sharedPolls = cD[classCode].students[user.username].sharedPolls
											sharedPolls.splice(sharedPolls.indexOf(pollId), 1)
											customPollUpdate(user.username)
										} catch (err) {
											logger.log('error', err.stack);
										}
									})
								} catch (err) {
									logger.log('error', err.stack);
								}
							}
						)
					} catch (err) {
						logger.log('error', err.stack);
					}
				}
			)
		} catch (err) {
			logger.log('error', err.stack);
		}
	})

	socket.on('getPollShareIds', (pollId) => {
		logger.log('info', `[getPollShareIds] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
		logger.log('info', `[getPollShareIds] pollId=(${pollId})`)

		getPollShareIds(pollId)
	})

	socket.on('sharePollToClass', (pollId, classCode) => {
		try {
			logger.log('info', `[sharePollToClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[sharePollToClass] pollId=(${pollId}) classCode=(${classCode})`)

			db.get('SELECT * FROM classroom WHERE key = ?', classCode, (err, classroom) => {
				try {
					if (err) throw err

					if (!classroom) {
						socket.emit('message', 'There is no class with that code.')
						return
					}

					db.get('SELECT * FROM custom_polls WHERE id = ?', pollId, (err, poll) => {
						try {
							if (err) throw err

							if (!poll) {
								logger.log('critical', 'Poll does not exist (Please contact the programmer)')
								socket.emit('message', 'Poll does not exist (Please contact the programmer)')
								return
							}

							let name = 'Unnamed Poll'
							if (poll.name) name = poll.name
							else if (poll.prompt) name = poll.prompt

							db.get(
								'SELECT * FROM class_polls WHERE pollId = ? AND classId = ?',
								[pollId, classroom.id],
								(err, sharePoll) => {
									try {
										if (err) throw err

										if (sharePoll) {
											socket.emit('message', `${name} is Already Shared with that class`)
											return
										}

										db.run(
											'INSERT INTO class_polls (pollId, classId) VALUES (?, ?)',
											[pollId, classroom.id],
											async (err) => {
												try {
													if (err) throw err

													socket.emit('message', `Shared ${name} with that class`)

													getPollShareIds(pollId)

													cD[classCode].sharedPolls.push(pollId)
													for (let username of Object.keys(cD[classCode].students)) {
														customPollUpdate(username)
													}
												} catch (err) {
													logger.log('error', err.stack)
												}
											}
										)
									} catch (err) {
										logger.log('error', err.stack)
									}
								}
							)
						} catch (err) {
							logger.log('error', err.stack)
						}
					})
				} catch (err) {
					logger.log('error', err.stack)
				}
			})
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	socket.on('removeClassPollShare', (pollId, classId) => {
		try {
			logger.log('info', `[removeClassPollShare] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[removeClassPollShare] pollId=(${pollId}) classId=(${classId})`)

			db.get(
				'SELECT * FROM class_polls WHERE pollId = ? AND classId = ?',
				[pollId, classId],
				(err, pollShare) => {
					try {
						if (err) throw err

						if (!pollShare) {
							socket.emit('message', 'Poll is not shared to this class')
							return
						}

						db.run(
							'DELETE FROM class_polls WHERE pollId = ? AND classId = ?',
							[pollId, classId],
							(err) => {
								try {
									if (err) throw err

									socket.emit('message', 'Successfully unshared class')
									getPollShareIds(pollId)

									db.get('SELECT * FROM classroom WHERE id = ?', classId, async (err, classroom) => {
										try {
											if (err) throw err

											if (!classroom) {
												logger.log('critical', 'Classroom does not exist')
												return
											}
											if (!cD[classroom.key]) return

											let sharedPolls = cD[classroom.key].sharedPolls
											sharedPolls.splice(sharedPolls.indexOf(pollId), 1)
											for (let username of Object.keys(cD[classroom.key].students)) {
												customPollUpdate(username)
											}
										} catch (err) {
											logger.log('error', err.stack);
										}
									})
								} catch (err) {
									logger.log('error', err.stack)
								}
							}
						)
					} catch (err) {
						logger.log('error', err.stack)
					}
				}
			)
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	// Sends a help ticket
	socket.on('help', (reason, time) => {
		try {
			logger.log('info', `[help] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[help] reason=(${reason}) time=(${time})`)

			cD[socket.request.session.class].students[socket.request.session.username].help = { reason: reason, time: time }

			logger.log('verbose', `[help] user=(${JSON.stringify(cD[socket.request.session.class].students[socket.request.session.username])})`)

			cpUpdate()
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	// Sends a break ticket
	socket.on('requestBreak', (reason) => {
		try {
			logger.log('info', `[requestBreak] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[requestBreak] reason=(${reason})`)

			let student = cD[socket.request.session.class].students[socket.request.session.username]
			student.break = reason

			logger.log('verbose', `[requestBreak] user=(${JSON.stringify(cD[socket.request.session.class].students[socket.request.session.username])})`)

			cpUpdate()
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	// Aproves the break ticket request
	socket.on('approveBreak', (breakApproval, username) => {
		try {
			logger.log('info', `[approveBreak] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[approveBreak] breakApproval=(${breakApproval}) username=(${username})`)

			let student = cD[socket.request.session.class].students[username]
			student.break = breakApproval

			logger.log('verbose', `[approveBreak] user=(${JSON.stringify(cD[socket.request.session.class].students[username])})`)

			if (breakApproval) io.to(username).emit('break')
			cpUpdate()
			vbUpdate()
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	// Ends the break
	socket.on('endBreak', () => {
		try {
			logger.log('info', `[endBreak] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

			let student = cD[socket.request.session.class].students[socket.request.session.username]
			student.break = false

			logger.log('verbose', `[endBreak] user=(${JSON.stringify(cD[socket.request.session.class].students[socket.request.session.username])})`)

			cpUpdate()
			vbUpdate()
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	// Deletes a user from the class
	socket.on('deleteStudent', (username) => {
		try {
			logger.log('info', `[deleteStudent] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[deleteStudent] username=(${username})`)

			const classCode = socket.request.session.class
			deleteStudent(username, classCode)
			cpUpdate(classCode)
			vbUpdate(classCode)
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	// Deletes all students from the class
	socket.on('deleteStudents', () => {
		try {
			logger.log('info', `[deleteStudents] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

			const classCode = socket.request.session.class
			deleteStudents(classCode)
			cpUpdate(classCode)
			vbUpdate(classCode)
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	socket.on('leaveClass', () => {
		try {
			logger.log('info', `[leaveClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

			const userId = socket.request.session.userId
			const username = socket.request.session.username
			const classCode = socket.request.session.class
			deleteStudent(username, classCode)
			cpUpdate(classCode)
			vbUpdate(classCode)

			db.get(
				'SELECT * FROM classroom WHERE owner=? AND key=?',
				[userId, classCode],
				(err, classroom) => {
					if (err) logger.log('error', err.stack)
					else if (classroom) endClass(classroom.key)
				}
			)
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	socket.on('logout', () => {
		try {
			logger.log('info', `[logout] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

			const username = socket.request.session.username
			const userId = socket.request.session.userId
			const classCode = socket.request.session.class
			const className = cD[classCode].className

			socket.request.session.destroy((err) => {
				try {
					if (err) throw err

					delete userSockets[username]
					delete cD[classCode].students[username]
					socket.leave(className)
					cpUpdate(classCode)
					vbUpdate(classCode)

					db.get(
						'SELECT * FROM classroom WHERE owner=? AND key=?',
						[userId, classCode],
						(err, classroom) => {
							if (err) logger.log('error', err.stack)
							if (classroom) endClass(classroom.key)
						}
					)
				} catch (err) {
					logger.log('error', err.stack)
				}
			})
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	socket.on('endClass', () => {
		try {
			logger.log('info', `[endClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

			const userId = socket.request.session.userId
			const classCode = socket.request.session.class

			db.get(
				'SELECT * FROM classroom WHERE owner=? AND key=?',
				[userId, classCode],
				(err, classroom) => {
					if (err) logger.log('error', err.stack)
					else if (classroom) endClass(classroom.key)
				}
			)
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	socket.on('deleteClass', (classId) => {
		try {
			logger.log('info', `[deleteClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[deleteClass] classId=(${classId})`)

			db.get('SELECT * FROM classroom WHERE id = ?', classId, (err, classroom) => {
				try {
					if (err) throw err

					if (classroom) {
						if (cD[classroom.key]) endClass(classroom.key)

						db.run('DELETE FROM classroom WHERE id = ?', classroom.id)
						db.run('DELETE FROM classusers WHERE classId = ?', classroom.id)
						db.run('DELETE FROM poll_history WHERE class = ?', classroom.id)
					}

					getOwnedClasses(socket.request.session.username)
				} catch (err) {
					logger.log('error', err.stack)
				}
			})
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	// Joins a classroom for websocket usage
	socket.on('joinRoom', (className) => {
		try {
			logger.log('info', `[joinRoom] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[joinRoom] className=(${className})`)

			socket.join(className)
			socket.request.session.class = className
			socket.emit('joinRoom', socket.request.session.class)
			vbUpdate()
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	socket.on('leaveRoom', (className) => {
		try {
			logger.log('info', `[leaveRoom] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[leaveRoom] className=(${className})`)

			socket.leave(className)
			vbUpdate()
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	// Updates and stores poll history
	socket.on('cpUpdate', () => {
		logger.log('info', `[cpUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

		cpUpdate();
	})

	// socket.on('sfxGet', function () {
	//     io.to(cD[socket.request.session.class].className).emit('sfxGet')
	// })

	// socket.on('sfxLoad', function (sfxFiles) {
	//     io.to(cD[socket.request.session.class].className).emit('sfxLoadUpdate', sfxFiles.files, sfxFiles.playing)
	// })

	// socket.on('sfxPlay', function (music) {
	//     io.to(cD[socket.request.session.class].className).emit('sfxPlay', music)
	// })

	// Displays previous polls
	socket.on('previousPollDisplay', (pollindex) => {
		try {
			logger.log('info', `[previousPollDisplay] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[previousPollDisplay] pollindex=(${pollindex})`)

			db.get('SELECT data FROM poll_history WHERE id = ?', pollindex, (err, pollData) => {
				try {
					if (err) throw err

					io.to(socket.request.session.class).emit('previousPollData', JSON.parse(pollData.data))
				} catch (err) {
					logger.log('error', err.stack)
				}
			})
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	// Moves to the next step
	socket.on('doStep', (index) => {
		try {
			logger.log('info', `[doStep] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[doStep] index=(${index})`)

			// send reload to whole class
			socket.broadcast.to(socket.request.session.class).emit('reload')
			cD[socket.request.session.class].currentStep++

			if (cD[socket.request.session.class].steps[index] !== undefined) {
				// Creates a poll based on the step data
				if (cD[socket.request.session.class].steps[index].type == 'poll') {
					cD[socket.request.session.class].mode = 'poll'

					if (cD[socket.request.session.class].poll.status == true) {
						cD[socket.request.session.class].poll.responses = {}
						cD[socket.request.session.class].poll.prompt = ''
						cD[socket.request.session.class].poll.status = false
					};

					cD[socket.request.session.class].poll.status = true
					// Creates an object for every answer possible the teacher is allowing
					for (let i = 0; i < cD[socket.request.session.class].steps[index].responses; i++) {
						if (cD[socket.request.session.class].steps[index].labels[i] == '' || cD[socket.request.session.class].steps[index].labels[i] == null) {
							let letterString = 'abcdefghijklmnopqrstuvwxyz'
							cD[socket.request.session.class].poll.responses[letterString[i]] = { answer: 'Answer ' + letterString[i], weight: 1 }
						} else {
							cD[socket.request.session.class].poll.responses[cD[socket.request.session.class].steps[index].labels[i]] = { answer: cD[socket.request.session.class].steps[index].labels[i], weight: cD[socket.request.session.class].steps[index].weights[i] }
						}
					}
					cD[socket.request.session.class].poll.textRes = false
					cD[socket.request.session.class].poll.prompt = cD[socket.request.session.class].steps[index].prompt
					// Creates a new quiz based on step data
				} else if (cD[socket.request.session.class].steps[index].type == 'quiz') {
					cD[socket.request.session.class].mode = 'quiz'
					questions = cD[socket.request.session.class].steps[index].questions
					let quiz = new Quiz(questions.length, 100)
					quiz.questions = questions
					cD[socket.request.session.class].quiz = quiz
					// Creates lesson based on step data
				} else if (cD[socket.request.session.class].steps[index].type == 'lesson') {
					cD[socket.request.session.class].mode = 'lesson'
					let lesson = new Lesson(cD[socket.request.session.class].steps[index].date, cD[socket.request.session.class].steps[index].lesson)
					cD[socket.request.session.class].lesson = lesson
					db.run('INSERT INTO lessons(class, content, date) VALUES(?, ?, ?)',
						[cD[socket.request.session.class].className, JSON.stringify(cD[socket.request.session.class].lesson), cD[socket.request.session.class].lesson.date], (err) => {
							if (err) logger.log('error', err.stack)
						}
					)
					cD[socket.request.session.class].poll.textRes = false
					cD[socket.request.session.class].poll.prompt = cD[socket.request.session.class].steps[index].prompt
					// Check this later, there's already a quiz if statement
				} else if (cD[socket.request.session.class].steps[index].type == 'quiz') {
					questions = cD[socket.request.session.class].steps[index].questions
					quiz = new Quiz(questions.length, 100)
					quiz.questions = questions
					cD[socket.request.session.class].quiz = quiz
					// Check this later, there's already a lesson if statement
				} else if (cD[socket.request.session.class].steps[index].type == 'lesson') {
					let lesson = new Lesson(cD[socket.request.session.class].steps[index].date, cD[socket.request.session.class].steps[index].lesson)
					cD[socket.request.session.class].lesson = lesson
					db.run('INSERT INTO lessons(class, content, date) VALUES(?, ?, ?)',
						[cD[socket.request.session.class].className, JSON.stringify(cD[socket.request.session.class].lesson), cD[socket.request.session.class].lesson.date], (err) => {
							if (err) logger.log('error', err.stack)
						}
					)
				}

				pollUpdate()
				modeUpdate()
				quizUpdate()
				lessonUpdate()
			} else {
				cD[socket.request.session.class].currentStep = 0
			}
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	// Deletes help ticket
	socket.on('deleteTicket', (student) => {
		try {
			logger.log('info', `[deleteTicket] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[deleteTicket] student=(${student})`)

			cD[socket.request.session.class].students[student].help = ''

			logger.log('verbose', `[deleteTicket] user=(${JSON.stringify(cD[socket.request.session.class].students[student])})`)
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	// Changes the class mode
	socket.on('modechange', (mode) => {
		try {
			logger.log('info', `[modechange] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[modechange] mode=(${mode})`)

			cD[socket.request.session.class].mode = mode

			logger.log('verbose', `[modechange] classData=(${cD[socket.request.session.class]})`)

			modeUpdate()
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	socket.on('pluginUpdate', () => {
		logger.log('info', `[pluginUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

		pluginUpdate()
	})

	socket.on('changePlugin', (id, name, url) => {
		try {
			logger.log('info', `[changePlugin] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[changePlugin] id=(${id}) name=(${name}) url=(${url})`)

			if (name) {
				db.run(
					'UPDATE plugins set name=? WHERE id=?',
					[name, id],
					(err) => {
						if (err) logger.log('error', err)
						else pluginUpdate()
					}
				)
			} else if (url) {
				db.run('UPDATE plugins set url=? WHERE id=?', [url, id], (err) => {
					if (err) logger.log('error', err)
					else pluginUpdate()
				})
			} else logger.log('critical', 'changePlugin called without name or url')
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	socket.on('addPlugin', (name, url) => {
		try {
			logger.log('info', `[addPlugin] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[addPlugin] name=(${name}) url=(${url})`)

			db.get(
				'SELECT * FROM classroom WHERE key = ?',
				[socket.request.session.class],
				(err, classData) => {
					try {
						if (err) throw err

						db.run(
							'INSERT INTO plugins(name, url, classId) VALUES(?, ?, ?)',
							[name, url, classData.id]
						)
						pluginUpdate()
					} catch (err) {
						logger.log('error', err.stack)
					}
				}
			)
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	socket.on('removePlugin', (id) => {
		try {
			logger.log('info', `[removePlugin] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[removePlugin] id=(${id})`)

			db.run('DELETE FROM plugins WHERE id=?', [id])
			pluginUpdate()
		} catch (err) {
			logger.log('error', err.stack)
		}
	})

	socket.on('getOwnedClasses', (username) => {
		logger.log('info', `[getOwnedClasses] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
		logger.log('info', `[getOwnedClasses] username=(${username})`)

		getOwnedClasses(username)
	})

	// sends the class code of the class a user is in
	socket.on('getUserClass', ({ username, api }) => {
		try {
			logger.log('info', `[getUserClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[getUserClass] username=(${username}) api=(${api})`)

			if (api) {
				db.get('SELECT * FROM users WHERE API = ?', [api], (err, userData) => {
					try {
						if (err) throw err
						if (!userData) {
							socket.emit('getUserClass', { error: 'not a valid API Key' })
							return
						}

						let classCode = getUserClass(userData.username)

						if (classCode instanceof Error) throw classCode

						if (!classCode) socket.emit('getUserClass', { error: 'user is not logged in' })
						else if (classCode == 'noClass') socket.emit('getUserClass', { error: 'user is not in a class' })
						else socket.emit('getUserClass', className)
					} catch (err) {
						logger.log('error', err.stack)
						socket.emit('getUserClass', { error: 'There was a server error try again.' })
					}
				})
			} else if (username) {
				let classCode = getUserClass(username)

				if (classCode instanceof Error) throw classCode

				if (!classCode) socket.emit('getUserClass', { error: 'user is not logged in' })
				else if (classCode == 'noClass') socket.emit('getUserClass', { error: 'user is not in a class' })
				else socket.emit('getUserClass', className)
			} else socket.emit('getUserClass', { error: 'missing username or api key' })
		} catch (err) {
			logger.log('error', err.stack)
			socket.emit('getUserClass', { error: 'There was a server error try again.' })
		}
	})

	socket.on('bannedStudentsUpdate', () => {
		bannedStudentsUpdate()
	})

	socket.on('banStudent', (user) => {
		try {
			logger.log('info', `[ban] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[ban] user=(${user})`)

			let classCode = socket.request.session.class
			logger.log('info', `[ban] classCode=(${classCode})`)

			if (!classCode || classCode == 'noClass') {
				logger.log('info', '[ban] The user is not in a class.')
				socket.emit('message', 'You are not in a class')
				return
			}

			if (!user) {
				logger.log('critical', '[ban] no username provided.')
				socket.emit('message', 'No username provided. (Please contact the programmer)')
				return
			}

			db.run('UPDATE classusers SET permissions = 0 WHERE classId = (SELECT id FROM classroom WHERE key = ?) AND studentId = (SELECT id FROM users WHERE username = ?)', [
				socket.request.session.class,
				user
			], (err) => {
				try {
					if (err) throw err

					if (cD[socket.request.session.class].students[user])
						cD[socket.request.session.class].students[user].classPermissions = 0

					deleteStudent(user)
					bannedStudentsUpdate()
					cpUpdate()
					socket.emit('message', `Banned ${user}`)
				} catch (err) {
					logger.log('error', err.stack)
					socket.emit('message', 'There was a server error try again.')
				}
			})
		} catch (err) {
			logger.log('error', err.stack)
			socket.emit('message', 'There was a server error try again.')
		}
	})

	socket.on('unbanStudent', (user) => {
		try {
			logger.log('info', `[unban] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[unban] user=(${user})`)

			let classCode = socket.request.session.class
			logger.log('info', `[unban] classCode=(${classCode})`)

			if (!classCode || classCode == 'noClass') {
				logger.log('info', '[unban] The user is not in a class.')
				socket.emit('message', 'You are not in a class')
				return
			}

			if (!user) {
				logger.log('critical', '[unban] no username provided.')
				socket.emit('message', 'No username provided. (Please contact the programmer)')
				return
			}

			db.run('UPDATE classusers SET permissions = 1 WHERE classId = (SELECT id FROM classroom WHERE key = ?) AND studentId = (SELECT id FROM users WHERE username = ?)', [
				socket.request.session.class,
				user
			], (err) => {
				try {
					if (err) throw err

					if (cD[socket.request.session.class].students[user])
						cD[socket.request.session.class].students[user].permissions = 1

					bannedStudentsUpdate()
					socket.emit('message', `Unbanned ${user}`)
				} catch (err) {
					logger.log('error', err.stack)
					socket.emit('message', 'There was a server error try again.')
				}
			})
		} catch (err) {
			logger.log('error', err.stack)
			socket.emit('message', 'There was a server error try again.')
		}
	})

	socket.on('setClassPermissionSetting', (permission, level) => {
		try {
			logger.log('info', `[setClassPermissionSetting] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
			logger.log('info', `[setClassPermissionSetting] permission=(${permission}) level=(${level})`)

			let classCode = socket.request.session.class
			cD[classCode].permissions[permission] = level
			db.run('UPDATE classroom SET permissions = ? WHERE id = ?', [JSON.stringify(cD[classCode].permissions), cD[classCode].id], (err) => {
				try {
					if (err) throw err

					logger.log('info', `[setClassPermissionSetting] ${permission} set to ${level}`)
					cpUpdate()
				} catch (err) {
					logger.log('error', err.stack)
				}
			})
		} catch (err) {
			logger.log('error', err.stack)
		}
	});
	socket.on('saveTags',
		(studentId, tags, username) => {
			try {
				logger.log('info', `[saveTags] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
				logger.log('info', `[saveTags] studentId=(${studentId}) tags=(${JSON.stringify(tags)})`)
				cD[socket.request.session.class].students[username].tags = tags.toString()
				db.get('SELECT * FROM users WHERE id = ?', [studentId], (err, row) => {
					if (err) {
						return console.error(err.message);
					}
					if (row) {
						// Row exists, update it
						db.run('UPDATE users SET tags = ? WHERE id = ?', [tags.toString(), studentId], (err) => {
							if (err) {
								return console.error(err.message);
							}
						});
					} else {
						console.log(`No row found with id ${studentId}`);
					}
				});
			}

			catch (err) {
				logger.log('error', err.stack)
			}
		}
	);
})


http.listen(420, () => {
	console.log('Running on port: 420')
	logger.log('info', 'Start')
})