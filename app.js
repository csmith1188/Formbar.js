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
app.use(express.static(__dirname + '/static'));
app.use('/js/chart.js', express.static(__dirname + '/node_modules/chart.js/dist/chart.umd.js'));
app.use('/js/iro.js', express.static(__dirname + '/node_modules/@jaames/iro/dist/iro.min.js'));
app.use('/js/floating-ui-core.js', express.static(__dirname + '/node_modules/@floating-ui/core/dist/floating-ui.core.umd.min.js'));
app.use('/js/floating-ui-dom.js', express.static(__dirname + '/node_modules/@floating-ui/dom/dist/floating-ui.dom.umd.min.js'));

// Establishes the connection to the database file
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

const MAX_CLASS_PERMISSIONS = TEACHER_PERMISSIONS

// Permission level needed to access each page
const PAGE_PERMISSIONS = {
	controlPanel: { permissions: TEACHER_PERMISSIONS, classPage: true },
	previousLessons: { permissions: TEACHER_PERMISSIONS, classPage: true },
	chat: { permissions: STUDENT_PERMISSIONS, classPage: true },
	poll: { permissions: STUDENT_PERMISSIONS, classPage: true },
	student: { permissions: STUDENT_PERMISSIONS, classPage: true },
	virtualbar: { permissions: GUEST_PERMISSIONS, classPage: true },
	makeQuiz: { permissions: TEACHER_PERMISSIONS, classPage: true },
	help: { permissions: STUDENT_PERMISSIONS, classPage: true },
	bgm: { permissions: MOD_PERMISSIONS, classPage: true },
	sfx: { permissions: MOD_PERMISSIONS, classPage: true },
	plugins: { permissions: STUDENT_PERMISSIONS, classPage: true },
	manageClass: { permissions: TEACHER_PERMISSIONS, classPage: false },
	createClass: { permissions: TEACHER_PERMISSIONS, classPage: false },
	selectClass: { permissions: GUEST_PERMISSIONS, classPage: false },
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
		sharedPolls = []
	) {
		this.username = username
		this.id = id
		this.permissions = permissions
		this.classPermissions = null
		this.ownedPolls = ownedPolls || []
		this.sharedPolls = sharedPolls || []
		this.pollRes = {
			buttonRes: '',
			textRes: ''
		}
		this.help = ''
		this.break = ''
		this.quizScore = ''
		this.API = API
		this.pogMeter = 0
	}
}


// This class is used to add a new classroom to the session data
// The classroom will be used to add lessons, do lessons, and for the teacher to operate them
class Classroom {
	// Needs the name of the class you want to create
	constructor(id, className, key, sharedPolls = []) {
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
/*
Check if user has logged in
Place at the start of any page that needs to verify if a user is logged in or not
This allows websites to check on their own if the user is logged in
This also allows for the website to check for permissions
*/
function isAuthenticated(req, res, next) {
	try {
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
		logger.log("error", err);
	};
};

// Check if user is logged in. Only used for create and select class pages
// Use isAuthenticated function for any other pages
// Created for the first page since there is no check before this
// This allows for a first check in where the user gets checked by the webpage
function isLoggedIn(req, res, next) {
	try {
		if (req.session.username) {
			next()
		} else {
			res.redirect('/login')
		}
	} catch (err) {
		logger.log('error', err);
	}
}

// Check if user has the permission levels to enter that page
function permCheck(req, res, next) {
	try {
		let username = req.session.username
		let classCode = req.session.class

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

			if (!PAGE_PERMISSIONS[urlPath])
				res.render('pages/message', {
					message: `Error: ${urlPath} is not in the page permissions`,
					title: 'Error'
				})

			// Checks if users permissions are high enough
			if (
				PAGE_PERMISSIONS[urlPath].classPage &&
				cD[classCode].students[username].classPermissions >= PAGE_PERMISSIONS[urlPath].permissions
			) next()
			else if (
				!PAGE_PERMISSIONS[urlPath].classPage &&
				cD[classCode].students[username].permissions >= PAGE_PERMISSIONS[urlPath].permissions
			) next()
			else {
				res.render('pages/message', {
					message: `Error: you don't have high enough permissions to access ${urlPath}`,
					title: 'Error'
				})
			}
		}
	} catch (err) {
		logger.log("error", err);
	};
};

// Allows the user to join a class
function joinClass(userName, code) {
	return new Promise((resolve, reject) => {
		try {
			// Find the id of the class from the database
			db.get('SELECT id FROM classroom WHERE key=?', [code], (err, classId) => {
				try {
					// Check to make sure there was a class with that name
					if (!classId || !cD[code] || cD[code].key != code) {
						reject(new Error('no open class with that code'))
						return
					}

					// Find the id of the user who is trying to join the class
					db.get('SELECT id FROM users WHERE username=?', [userName], (err, userId) => {
						try {
							if (userId) {
								// Add the two id's to the junction table to link the user and class
								db.get('SELECT * FROM classusers WHERE classuid = ? AND studentuid = ?',
									[classId.id, userId.id],
									(err, classUser) => {
										try {
											if (err) {
												logger.log("error", err)
												reject(new Error('something went wrong'))
												return
											}

											if (!classUser) {
												db.run('INSERT INTO classusers(classuid, studentuid, permissions, digiPogs) VALUES(?, ?, ?, ?)',
													[classId.id, userId.id, GUEST_PERMISSIONS, 0], (err) => {
														try {
															if (err) {
																logger.log("error", err)
																reject(new Error('something went wrong'))
																return
															}

															let user = cD.noClass.students[userName]
															user.classPermissions = GUEST_PERMISSIONS

															// Remove student from old class
															delete cD.noClass.students[userName]
															// Add the student to the newly created class
															cD[code].students[userName] = user
															resolve(true)
														} catch (err) {
															logger.log("error", err)
															reject(new Error('something went wrong'))
														}
													}
												)
												return
											}

											// Get the student's session data ready to transport into new class
											let user = cD.noClass.students[userName]
											if (classUser.permissions <= BANNED_PERMISSIONS) resolve(new Error('you are banned from that class'))

											user.classPermissions = classUser.permissions

											// Remove student from old class
											delete cD.noClass.students[userName]
											// Add the student to the newly created class
											cD[code].students[userName] = user
											resolve(true)
										} catch (err) {
											logger.log("error", err)
											reject(new Error('something went wrong'))
										}
									}
								)
							}
						} catch (err) {
							logger.log("error", err)
							reject(new Error('something went wrong'))
						}
					})
				} catch (err) {
					logger.log("error", err)
					reject(new Error('something went wrong'))
				}
			})
		} catch (err) {
			logger.log("error", err)
			reject(new Error('something went wrong'))
		}
	})
}

// Function to convert HSL to Hex
function convertHSLToHex(hue, saturation, lightness) {
	try {
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
				logger.log('error', err)
			}
		};

		// Return the hex color
		return `#${getColorComponent(0)}${getColorComponent(8)}${getColorComponent(4)}`;
	} catch (err) {
		logger.log('error', err)
	}
}

// Function to generate colors
function generateColors(amount) {
	try {
		// Initialize colors array
		let colors = [];

		// Initialize hue
		let hue = 0

		// Generate colors
		for (let i = 0; i < amount; i++) {
			// Add color to the colors array
			colors.push(convertHSLToHex(hue, 100, 50));

			// Increment hue
			hue += 360 / amount
		}

		// Return the colors array
		return colors;
	} catch (err) {
		logger.log('error', err)
	}
}

function getUserClass(username) {
	try {
		for (let classCode of Object.keys(cD)) {
			if (cD[classCode].students[username]) return classCode
		}
		return null
	} catch (err) {
		logger.log('error', err)
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
	res.redirect('/student')
})


// A
//The page displaying the API key used when handling oauth2 requests from outside programs such as formPix
app.get('/apikey', isAuthenticated, (req, res) => {
	try {
		res.render('pages/apiKey', {
			title: "API Key",
			API: cD[req.session.class].students[req.session.username].API
		})
	} catch (err) {
		logger.log('error', err)
	}
})

// B

// C


// An endpoint for the teacher to control the formbar
// Used to update students permissions, handle polls and their corresponsing responses
// On render it will send all students in that class to the page
app.get('/controlPanel', isAuthenticated, permCheck, (req, res) => {
	try {
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
			title: "Control Panel",
			pollStatus: cD[req.session.class].poll.status,
			currentUser: JSON.stringify(cD[req.session.class].students[req.session.username])
		})
	} catch (err) {
		logger.log("error", err);
	};
});

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
		logger.log("error", err);
	};
});

// Allow teacher to create class
// Allowing the teacher to create classes is vital to whether the lesson actually works or not, because they have to be allowed to create a teacher class
// This will allow the teacher to give students student perms, and guests student perms as well
// Plus they can ban and kick as long as they can create classes
app.post('/createClass', isLoggedIn, permCheck, (req, res) => {
	try {
		let submittionType = req.body.submittionType
		let className = req.body.name
		let classId = req.body.id

		function makeClass(id, className, key, sharedPolls = []) {
			try {
				// Get the teachers session data ready to transport into new class
				var user = cD.noClass.students[req.session.username]
				// Remove teacher from old class
				delete cD.noClass.students[req.session.username]
				// Add class into the session data
				cD[key] = new Classroom(id, className, key, sharedPolls)
				// Add the teacher to the newly created class
				cD[key].students[req.session.username] = user
				cD[key].students[req.session.username].classPermissions = MANAGER_PERMISSIONS

				req.session.class = key

				res.redirect('/')
			} catch (err) {
				logger.log("error", err);
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
			db.run('INSERT INTO classroom(name, owner, key) VALUES(?, ?, ?)', [className, req.session.userId, key], (err) => {
				try {
					db.get('SELECT classroom.id, classroom.name, classroom.key, NULLIF(json_group_array(DISTINCT class_polls.pollId), "[null]") as sharedPolls FROM classroom LEFT JOIN class_polls ON class_polls.classId = classroom.id WHERE classroom.name = ? AND classroom.owner = ?', [className, req.session.userId], (err, classroom) => {
						try {
							if (err) {
								logger.log('error', err)
								return
							}

							if (!classroom.id) {
								res.render('pages/message', {
									message: "Class does not exist (please contact the programmer)",
									title: 'Login'
								})
							}

							makeClass(
								classroom.id,
								classroom.name,
								classroom.key,
								JSON.parse(classroom.sharedPolls)
							)
						} catch (err) {
							logger.log("error", err)
						}
					})
				} catch (err) {
					logger.log("error", err)
				}
			})
		} else {
			db.get('SELECT id, name, key FROM classroom WHERE id = ?', [classId], (err, classroom) => {
				try {
					if (!classroom) {
						res.render('pages/message', {
							message: "Class does not exist (please contact the programmer)",
							title: 'Login'
						})
					}

					makeClass(
						classroom.id,
						classroom.name,
						classroom.key,
					)
				} catch (err) {
					logger.log("error", err)
				}
			})
		}
	} catch (err) {
		logger.log("error", err)
	}
})

// D
app.post('/deleteClass', isLoggedIn, permCheck, (req, res) => {
	try {
		let className = req.body.name

		db.get('SELECT * FROM classroom WHERE name = ?', className, (err, classroom) => {
			try {
				if (classroom) {
					if (cD[classroom.key]) {
						deleteStudents()
						delete cD[classroom.key]
					}
					db.run('DELETE FROM classroom WHERE name = ?', classroom.name)
				} else res.redirect('/')
			} catch (err) {
				logger.log("error", err);
			};
		});
	} catch (err) {
		logger.log("error", err);
	};
});

// E

// F

// G

// H


app.get('/help', isAuthenticated, permCheck, (req, res) => {
	try {
		res.render('pages/help', {
			title: "Help"
		})
	} catch (err) {
		logger.log("error", err);
	};
});

// I

// J

// K

// L
/* Allows the user to view previous lessons created, they are stored in the database- Riley R., May 22, 2023 */
app.get('/previousLessons', isAuthenticated, permCheck, (req, res) => {
	try {
		db.all('SELECT * FROM lessons WHERE class=?', cD[req.session.class].className, async (err, rows) => {
			try {
				if (rows) {
					res.render('pages/previousLesson', {
						rows: rows,
						title: "Previous Lesson"
					})
				}
			} catch (err) {
				logger.log("error", err)
			}
		})
	} catch (err) {
		logger.log("error", err)
	}
})

app.post('/previousLessons', isAuthenticated, permCheck, (req, res) => {
	try {
		let lesson = JSON.parse(req.body.data)
		res.render('pages/lesson', {
			lesson: lesson,
			title: "Today's Lesson"
		})
	} catch (err) {
		logger.log("error", err)
	}
})
// This renders the login page
// It displays the title and the color of the login page of the formbar js
// It allows for the login to check if the user wants to login to the server
// This makes sure the lesson can see the students and work with them
app.get('/login', (req, res) => {
	try {
		res.render('pages/login', {
			title: 'Login'
		})
	} catch (err) {
		logger.log("error", err)
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
		// Check whether user is logging in or signing up
		if (user.loginType == "login") {
			// Get the users login in data to verify password
			db.get('SELECT users.*, NULLIF(json_group_array(DISTINCT shared_polls.pollId), "[null]") as sharedPolls, NULLIF(json_group_array(DISTINCT custom_polls.id), "[null]") as ownedPolls FROM users LEFT JOIN shared_polls ON shared_polls.userId = users.id LEFT JOIN custom_polls ON custom_polls.owner = users.id WHERE users.username = ?', [user.username], async (err, userData) => {
				try {
					// Check if a user with that name was found in the database
					if (userData.username) {
						// Decrypt users password
						let tempPassword = decrypt(JSON.parse(userData.password))
						if (tempPassword == user.password) {
							let loggedIn = false
							let classKey = ''
							let classPermissions

							for (let classData of Object.values(cD)) {
								if (classData.key) {
									for (let username of Object.keys(classData.students)) {
										if (username == userData.username) {
											loggedIn = true
											classKey = classData.key
											classPermissions = classData.students[username].permissions

											break
										}
									}
								}
							}

							if (loggedIn) {
								req.session.class = classKey
							} else {
								// Add user to the session
								cD.noClass.students[userData.username] = new Student(userData.username, userData.id, userData.permissions, userData.API)
								req.session.class = 'noClass'
							}
							// Add a cookie to transfer user credentials across site
							req.session.userId = userData.id
							req.session.username = userData.username
							res.redirect('/')
						} else {
							res.render('pages/message', {
								message: "Incorrect password",
								title: 'Login'
							})
						}
					} else {
						res.render('pages/message', {
							message: "user does not exist",
							title: 'Login'
						})
					}
				} catch (err) {
					logger.log("error", err);
				};
			});
		} else if (user.loginType == "new") {
			let permissions = STUDENT_PERMISSIONS

			db.all('SELECT API, secret, username FROM users', (error, users) => {
				try {
					if (error) {
						logger.log('error', error)
					} else {
						// Add user to the session
						cD.noClass.students[userData.username] = new Student(
							userData.username,
							userData.id,
							userData.permissions,
							userData.API,
							JSON.parse(userData.ownedPolls),
							JSON.parse(userData.sharedPolls)
						)
						req.session.class = 'noClass'
					}
					// Add a cookie to transfer user credentials across site
					req.session.userId = userData.id
					req.session.username = userData.username
					res.redirect('/')
				} catch (err) {
					logger.log('error', err)
				}

				let existingAPIs = []
				let existingSecrets = []
				let newAPI
				let newSecret

				if (users.length == 0) permissions = MANAGER_PERMISSIONS

				for (let dbUser of users) {
					existingAPIs.push(dbUser.API)
					existingSecrets.push(dbUser.secret)
					if (dbUser.username == user.username) {
						res.redirect('/login')
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
				db.run('INSERT INTO users(username, password, permissions, API, secret) VALUES(?, ?, ?, ?, ?)',
					[
						user.username,
						JSON.stringify(passwordCrypt),
						permissions,
						newAPI,
						newSecret
					], (err) => {
						if (err) {
							logger.log('error', err)
							return
						}
						try {
							// Find the user in which was just created to get the id of the user
							db.get('SELECT * FROM users WHERE username=?', [user.username], (err, userData) => {
								if (err) {
									logger.log('error', err)
								} else {
									try {
										// Add user to session
										cD.noClass.students[userData.username] = new Student(userData.username, userData.id, userData.permissions, userData.API)

										// Add the user to the session in order to transfer data between each page
										req.session.userId = userData.id
										req.session.username = userData.username
										req.session.class = 'noClass'
										res.redirect('/')
									} catch (err) {
										logger.log('error', err)
									}
								}
							})
						} catch (err) {
							logger.log('error', err)
						}
					})
			})
		} else if (user.loginType == "guest") {

		}
	} catch (err) {
		logger.log("error", err);
	};
});

// M
// Loads which classes the teacher is an owner of
// This allows the teacher to be in charge of all classes
// The teacher can give any perms to anyone they desire, which is useful at times
// This also allows the teacher to kick or ban if needed
app.get('/manageClass', isLoggedIn, permCheck, (req, res) => {
	try {
		// Finds all classes the teacher is the owner of
		res.render('pages/manageClass', {
			title: 'Create Class',
			currentUser: JSON.stringify(cD[req.session.class].students[req.session.username])
		})
	} catch (err) {
		logger.log("error", err);
	};
});

// N

// O
/* This is what happens when the server tries to authenticate a user. It saves the redirectURL query parameter to a variable, and sends the redirectURL to the oauth page as
a variable. */
app.get('/oauth', (req, res) => {
	try {
		let redirectURL = req.query.redirectURL
		res.render('pages/oauth.ejs', {
			title: "Oauth",
			redirectURL: redirectURL
		})
	} catch (err) {
		logger.log("error", err);
	};
});

// This is what happens after the user submits their authentication data.
app.post('/oauth', (req, res) => {
	try {
		// It saves the username, password, and the redirectURL that is submitted.
		const {
			username,
			password,
			redirectURL
		} = req.body
		// If there is a username and password submitted, then it gets results from the database that match the username.
		if (username && password) {
			db.get('SELECT * FROM users WHERE username = ?', [username], (error, userData) => {
				try {
					// If there is userData returned, it saves the database password to a variable.
					if (userData) {
						let databasePassword = decrypt(JSON.parse(userData.password))
						// It then compares the submitted password to the database password.
						// If it matches, a token is generated, and the page redirects to the specified redirectURL using the token as a query parameter.
						if (databasePassword == password) {
							var token = jwt.sign({ username: username, permissions: userData.permissions }, userData.secret, { expiresIn: '30m' })
							res.redirect(`${redirectURL}?token=${token}`)
							// If it does not match, then it redirects you back to the oauth page.
						} else res.redirect(`/oauth?redirectURL=${redirectURL}`)
						// If there in no userData, then it redirects back to the oauth page.
					} else res.redirect(`/oauth?redirectURL=${redirectURL}`)
				} catch (err) {
					logger.log("error", err);
				};
			});
			// If either a username, password, or both is not returned, then it redirects back to the oauth page.
		} else res.redirect(`/oauth?redirectURL=${redirectURL}`)
	} catch (err) {
		logger.log("error", err);
	};
});

// P
app.get('/plugins', isAuthenticated, permCheck, (req, res) => {
	try {
		res.render('pages/plugins.ejs',
			{
				title: 'Plugins'
			})
	} catch (err) {
		logger.log("error", err);
	};
});

// Q



// R


// S

// selectClass
//Send user to the select class page
app.get('/selectClass', isLoggedIn, permCheck, (req, res) => {
	try {
		db.all(
			'SELECT classroom.name, classroom.key FROM users JOIN classusers ON users.id = classusers.studentuid JOIN classroom ON classusers.classuid = classroom.id WHERE users.username = ?',
			[req.session.username],
			(err, joinedClasses) => {
				try {
					res.render('pages/selectClass', {
						title: 'Select Class',
						joinedClasses
					})
				} catch (err) {
					logger.log("error", err);
				};
			}
		);
	} catch (err) {
		logger.log("error", err);
	};
});


//Adds user to a selected class, typically from the select class page
app.post('/selectClass', isLoggedIn, permCheck, async (req, res) => {
	try {
		let code = req.body.key.toLowerCase()

		await joinClass(req.session.username, code)

		req.session.class = code
		res.redirect('/')
	} catch (err) {
		logger.log("error", err)
		res.render('pages/message', {
			message: `Error: ${err.message}`,
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
			res.render('pages/queryquiz', {
				quiz: JSON.stringify(cD[req.session.class].quiz.questions[random]),
				title: "Quiz"
			})
			if (cD[req.session.class].quiz.questions[req.query.question] != undefined) {
				res.render('pages/queryquiz', {
					quiz: JSON.stringify(cD[req.session.class].quiz.questions[random]),
					title: "Quiz"
				})
			}
		} else if (isNaN(req.query.question) == false) {
			if (cD[req.session.class].quiz.questions[req.query.question] != undefined) {
				res.render('pages/queryquiz', {
					quiz: JSON.stringify(cD[req.session.class].quiz.questions[req.query.question]),
					title: "Quiz"
				})
			} else {
				res.render('pages/message', {
					message: "Error: please enter proper data",
					title: 'Error'
				})
			}
		} else if (req.query.question == undefined) {
			res.render('pages/student', {
				title: 'Student',
				user: JSON.stringify(user),
				myRes: cD[req.session.class].students[req.session.username].pollRes.buttonRes,
				myTextRes: cD[req.session.class].students[req.session.username].pollRes.textRes,
				lesson: cD[req.session.class].lesson
			})
		}
	} catch (err) {
		logger.log("error", err);
	};
});

/* This is for when you send poll data via a post command or when you submit a quiz.
If it's a poll it'll save your response to the student object and the database.
- Riley R., May 24, 2023
*/
app.post('/student', isAuthenticated, permCheck, (req, res) => {
	try {
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

			res.render('pages/results', {
				totalScore: Math.floor(totalScore),
				maxScore: cD[req.session.class].quiz.totalScore,
				title: "Results"
			})
		}
	} catch (err) {
		logger.log("error", err);
	};
});


// T

// U

// V
app.get('/virtualbar', isAuthenticated, permCheck, (req, res) => {
	try {
		res.render('pages/virtualbar', {
			title: 'Virtual Bar',
			io: io,
			className: cD[req.session.class].className
		})
	} catch (err) {
		logger.log("error", err);
	};
});

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

		if (urlPath.startsWith('api/')) {
			res.status(404).json(`Error: the page ${urlPath} does not exist`)
		} else {
			res.status(404).render('pages/message', {
				message: `Error: the page ${urlPath} does not exist`,
				title: "Error"
			})
		}
	} catch (err) {
		logger.log("error", err);
	};
});


// Middleware for sockets
// Authentication for users and plugins to connect to formbar websockets
// The user must be logged in order to connect to websockets
io.use((socket, next) => {
	try {
		let { api, classCode } = socket.request._query
		if (socket.request.session.username) {
			next()
		} else if (api) {
			socket.request.session.api = api
			socket.request.session.class = classCode
			if (!cD[socket.request.session.class]) socket.request.session.class = 'noClass'//return next(new Error("class not started"))
			db.get(
				'SELECT id, username, permissions FROM users WHERE API = ?',
				[api],
				(err, userData) => {
					try {
						if (err) logger.log("error", err)
						else if (!userData) return next(new Error('not a valid API Key'))
						next()
					} catch (err) {
						logger.log("error", err);
					};
				}
			);
		} else {
			logger.log("error", "Missing username or api");
		}
	} catch (err) {
		logger.log("error", err);
	};
});

let rateLimits = {}

let userSockets = {}

//Handles the websocket communications
io.on('connection', (socket) => {
	try {
		if (socket.request.session.username) {
			socket.join(socket.request.session.class)
			socket.join(socket.request.session.username)
			socket.join(`permissions-${cD[socket.request.session.class].students[socket.request.session.username].permissions}`)
			socket.join(`classPermissions-${cD[socket.request.session.class].students[socket.request.session.username].classPermissions}`)

			userSockets[socket.request.session.username] = socket
		}
		if (socket.request.session.api) {
			socket.join(socket.request.session.class)
		}
	} catch (err) {
		logger.log("error", err);
	};

	function cpUpdate(classCode) {
		try {
			if (!classCode) classCode = socket.request.session.class

			db.all('SELECT * FROM poll_history WHERE class = ?', cD[classCode].id, async (err, rows) => {
				try {
					var pollHistory = rows
					io.to(classCode).emit('cpUpdate', JSON.stringify(cD[classCode]), JSON.stringify(pollHistory))
				} catch (err) {
					logger.log("error", err)
				}
			})
		} catch (err) {
			logger.log("error", err)
		}
	}

	function vbUpdate(classCode) {
		try {
			if (!classCode) classCode = socket.request.session.class
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
			logger.log("error", err);
		};
	}

	function pollUpdate() {
		try {
			io.to(socket.request.session.class).emit('pollUpdate', cD[socket.request.session.class].poll)
		} catch (err) {
			logger.log("error", err);
		};
	};

	function modeUpdate() {
		try {
			io.to(socket.request.session.class).emit('modeUpdate', cD[socket.request.session.class].mode)
		} catch (err) {
			logger.log("error", err);
		};
	};

	function quizUpdate() {
		try {
			io.to(socket.request.session.class).emit('quizUpdate', cD[socket.request.session.class].quiz)
		} catch (err) {
			logger.log("error", err);
		};
	};

	function lessonUpdate() {
		try {
			io.to(socket.request.session.class).emit('lessonUpdate', cD[socket.request.session.class].lesson)
		} catch (err) {
			logger.log("error", err);
		};
	};

	function pluginUpdate() {
		try {
			db.all(
				'SELECT plugins.id, plugins.name, plugins.url FROM plugins JOIN classroom ON classroom.key = ?',
				[socket.request.session.class],
				(error, plugins) => {
					try {
						io.to(socket.request.session.class).emit('pluginUpdate', plugins)
					} catch (err) {
						logger.log("error", err)
					}
				}
			)
		} catch (err) {
			logger.log("error", err)
		}
	}

	function customPollUpdate(username) {
		try {
			let userSession = userSockets[username].request.session

			let userSharedPolls = cD[userSession.class].students[userSession.username].sharedPolls
			let userOwnedPolls = cD[userSession.class].students[userSession.username].ownedPolls
			let userCustomPolls = Array.from(new Set(userSharedPolls.concat(userOwnedPolls)))
			let classroomCustomPolls = structuredClone(cD[userSession.class].sharedPolls)
			let publicCustomPolls = []
			let customPollIds = userCustomPolls.concat(classroomCustomPolls)

			db.all(
				`SELECT * FROM custom_polls WHERE id IN (${customPollIds.map(() => '?').join(', ')}) OR public = 1 OR owner = ?`,
				[
					...customPollIds,
					userSession.userId
				],
				(err, customPolls) => {
					try {
						if (err) {
							logger.log('error', err)
							return
						}

						for (let customPoll of customPolls) {
							customPoll.answers = JSON.parse(customPoll.answers)
						}

						customPolls = customPolls.reduce((newObject, customPoll) => {
							try {
								newObject[customPoll.id] = customPoll
								return newObject
							} catch (err) {
								logger.log("error", err)
							}
						}, {})

						for (let customPoll of Object.values(customPolls)) {
							if (customPoll.public) {
								publicCustomPolls.push(customPoll.id)
							}
						}

						io.to(username).emit(
							'customPollUpdate',
							publicCustomPolls,
							classroomCustomPolls,
							userCustomPolls,
							customPolls
						)
					} catch (err) {
						logger.log('error', err)
					}
				}
			)
		} catch (err) {
			logger.log("error", err);
		}
	}

	function deleteStudent(username, classCode) {
		try {
			userSockets[username].leave(cD[classCode].className)
			cD.noClass.students[username] = cD[classCode].students[username]
			cD.noClass.students[username].classPermissions = null
			userSockets[username].request.session.class = 'noClass'
			userSockets[username].request.session.save()
			delete cD[classCode].students[username]
			io.to(username).emit('reload')
		} catch (err) {
			logger.log("error", err);
		};
	};

	function deleteStudents(classCode) {
		try {
			for (let username of Object.keys(cD[classCode].students)) {
				if (cD[classCode].students[username].classPermissions < TEACHER_PERMISSIONS) {
					deleteStudent(username, classCode)
				}
			}
		} catch (err) {
			logger.log("error", err);
		};
	};

	function endClass(classCode) {
		try {
			for (let username of Object.keys(cD[classCode].students)) {
				deleteStudent(username, classCode)
			}
			delete cD[classCode]
			socket.broadcast.to(socket.request.session.class).emit('classEnded')
		} catch (err) {
			logger.log("error", err);
		};
	};

	function getOwnedClasses(username) {
		try {
			db.all('SELECT name, id FROM classroom WHERE owner=?',
				[userSockets[username].request.session.userId], (err, ownedClasses) => {
					try {
						io.to(username).emit('getOwnedClasses', ownedClasses)
					} catch (err) {
						logger.log("error", err);
					};
				}
			);
		} catch (err) {
			logger.log("error", err);
		};
	};

	function getPollShareIds(pollId) {
		try {
			db.all(
				'SELECT pollId, userId, username FROM shared_polls LEFT JOIN users ON users.id = shared_polls.userId WHERE pollId = ?',
				pollId,
				(err, userPollShares) => {
					try {
						if (err) {
							logger.log('error', error)
							return
						}

						db.all(
							'SELECT pollId, classId, name FROM class_polls LEFT JOIN classroom ON classroom.id = class_polls.classId WHERE pollId = ?',
							pollId,
							(err, classPollShares) => {
								try {
									if (err) {
										logger.log('error', err)
										return
									}

									socket.emit('getPollShareIds', userPollShares, classPollShares)
								} catch (err) {
									logger.log("error", err)
								}
							}
						)
					} catch (err) {

					}
				}
			)
		} catch (err) {
			logger.log("error", err)
		}
	}

	//rate limiter
	socket.use((packet, next) => {
		try {
			const user = socket.request.session.username
			const now = Date.now()
			const limit = 5
			const timeFrame = 3000
			const blockTime = 3000
			const allowedRequests = ['pollResp', 'help', 'break']

			if (!rateLimits[user]) {
				rateLimits[user] = {}
			}

			const userRequests = rateLimits[user]

			const requestType = packet[0]
			if (!allowedRequests.includes(requestType)) {
				next()
				return
			}

			userRequests[requestType] = userRequests[requestType] || []

			userRequests[requestType] = userRequests[requestType].filter((timestamp) => now - timestamp < timeFrame)

			if (userRequests[requestType].length >= limit) {
				setTimeout(() => {
					try {

						userRequests[requestType].shift()
					} catch (err) {
						logger.log('error', err)
					}
				}, blockTime)
			} else {
				userRequests[requestType].push(now)
				next()
			}
		} catch (err) {
			logger.log("error", err);
		};
	});

	// /poll websockets for updating the database
	socket.on('pollResp', (res, textRes, resWeight, resLength) => {
		try {
			logger.info(`${socket.handshake.address}, ${socket.request.session.username}, ${res}, ${textRes}`);
			cD[socket.request.session.class].students[socket.request.session.username].pollRes.buttonRes = res
			cD[socket.request.session.class].students[socket.request.session.username].pollRes.textRes = textRes
			for (let i = 0; i < resLength; i++) {
				if (res) {
					let calcWeight = cD[socket.request.session.class].poll.weight * resWeight
					cD[socket.request.session.class].students[socket.request.session.username].pogMeter += calcWeight
					if (cD[socket.request.session.class].students[socket.request.session.username].pogMeter >= 25) {
						db.get('SELECT digipogs FROM classusers WHERE studentid = ?', [cD[socket.request.session.class].students[socket.request.session.username].id], (error, data) => {
							try {
								db.run('UPDATE classusers SET digiPogs = ? WHERE studentuid = ?', [data + 1, cD[socket.request.session.class].students[socket.request.session.username].id])
							} catch (err) {
								logger.log("error", err)
							}
						})
						cD[socket.request.session.class].students[socket.request.session.username].pogMeter = 0
					}
				}
			}
			cpUpdate()
			vbUpdate()
		} catch (err) {
			logger.log("error", err)
		}
	})

	// Changes Permission of user. Takes which user and the new permission level
	socket.on('classPermChange', (user, newPerm) => {
		try {
			newPerm = Number(newPerm)

			cD[socket.request.session.class].students[user].classPermissions = newPerm

			if (cD[socket.request.session.class].students[user].classPermissions > MAX_CLASS_PERMISSIONS)
				cD[socket.request.session.class].students[user].classPermissions = MAX_CLASS_PERMISSIONS

			db.run('UPDATE classusers SET permissions = ? WHERE classuid = ? AND studentuid = ?', [
				newPerm,
				cD[socket.request.session.class].id,
				cD[socket.request.session.class].students[user].id
			])

			io.to(user).emit('reload')

			cpUpdate()
		} catch (err) {
			logger.log("error", err);
		};
	});

	socket.on('permChange', (user, newPerm) => {
		try {
			newPerm = Number(newPerm)

			cD[socket.request.session.class].students[user].permissions = newPerm
			db.run('UPDATE users SET permissions = ? WHERE username = ?', [newPerm, user])
		} catch (err) {
			logger.log("error", err);
		};
	});

	// Starts a new poll. Takes the number of responses and whether or not their are text responses
	socket.on('startPoll', (resNumber, resTextBox, pollPrompt, polls, blind, weight) => {
		try {
			let generatedColors = generateColors(resNumber)

			cD[socket.request.session.class].mode = 'poll'
			cD[socket.request.session.class].poll.blind = blind
			cD[socket.request.session.class].poll.status = true

			// Creates an object for every answer possible the teacher is allowing
			for (let i = 0; i < resNumber; i++) {
				let letterString = "abcdefghijklmnopqrstuvwxyz"
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
				cD[socket.request.session.class].students[key].pollRes.buttonRes = ""
				cD[socket.request.session.class].students[key].pollRes.textRes = ""
			}

			pollUpdate()
			vbUpdate()
		} catch (err) {
			logger.log("error", err);
		};
	});

	// End the current poll. Does not take any arguments
	socket.on('endPoll', () => {
		try {
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
					if (err) logger.log("error", err)
				}
			)

			cD[socket.request.session.class].poll.responses = {}
			cD[socket.request.session.class].poll.prompt = ''
			cD[socket.request.session.class].poll.status = false

			pollUpdate()
			vbUpdate()
		} catch (err) {
			logger.log("error", err);
		};
	});

	socket.on('pollUpdate', () => {
		pollUpdate()
	})

	socket.on('modeUpdate', () => {
		modeUpdate()
	})

	socket.on('quizUpdate', () => {
		quizUpdate()
	})

	socket.on('lessonUpdate', () => {
		lessonUpdate()
	})

	// Sends poll and student response data to client side virtual bar
	socket.on('vbUpdate', () => {
		vbUpdate()
	})

	socket.on('customPollUpdate', () => {
		customPollUpdate(socket.request.session.username)
	})

	socket.on('savePoll', (poll, id) => {
		try {
			let userId = socket.request.session.userId

			if (id) {
				db.get(`SELECT * FROM custom_polls WHERE id = ?`, [id], (error, poll) => {
					try {
						if (error) {
							logger.log('error', error)
							return
						}

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
								if (err) {
									logger.log('error', err)
									return
								}
								socket.emit('message', 'Poll saved successfully!')
								customPollUpdate(socket.request.session.username)
							} catch (err) {
								logger.log("error", err)
							}
						})
					} catch (err) {
						logger.log("error", err)
					}
				})
			} else {
				db.get('SELECT seq AS nextPollId from sqlite_sequence WHERE name = "custom_polls"', (err, nextPollId) => {
					try {
						if (err) {
							logger.log("error", err)
							return
						}
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
								if (err) {
									logger.log('error', err);
									return
								}

								cD[socket.request.session.class].students[socket.request.session.username].ownedPolls.push(nextPollId)
								socket.emit('message', 'Poll saved successfully!')
								customPollUpdate(socket.request.session.username)
							} catch (err) {
								logger.log("error", err)
							}
						})
					} catch (err) {
						logger.log("error", err)
					}
				})
			}
		} catch (err) {
			logger.log("error", err);
		}
	})

	socket.on('deletePoll', (pollId) => {
		try {
			let userId = socket.request.session.userId

			if (!pollId) {
				socket.emit('message', 'No poll is selected.')
				return
			}

			db.get(`SELECT * FROM custom_polls WHERE id = ?`, pollId, async (err, poll) => {
				try {
					if (err) {
						logger.log('error', err)
						return
					}

					if (userId != poll.owner) {
						socket.emit('message', 'You do not have permission to delete this poll.')
						return
					}

					await db.run('BEGIN TRANSACTION')

					await Promise.all([
						db.run('DELETE FROM custom_polls WHERE id = ?', pollId),
						db.run('DELETE FROM shared_polls WHERE pollId = ?', pollId),
						db.run('DELETE FROM class_polls WHERE pollId = ?', pollId)
					]).catch((err) => {
						logger.log("error", err)
						db.run('ROLLBACK')
					})

					await db.run('COMMIT')

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

					socket.emit('message', 'Poll deleted successfully!')
				} catch (err) {
					logger.log("error", err)
				}
			})
		} catch (err) {
			logger.log("error", err)
		}
	})

	socket.on('setPublic', (pollId, value) => {
		try {
			db.run('UPDATE custom_polls set public = ? WHERE id = ?', [value, pollId], (error) => {
				try {
					if (error) {
						logger.log('error', error)
						return
					}

					for (let socket of Object.values(userSockets)) {
						customPollUpdate(socket.request.session.username)
					}
				} catch (err) {
					logger.log("error", err)
				}
			})
		} catch (err) {
			logger.log("error", err)
		}
	})

	socket.on('sharePollToUser', (pollId, username) => {
		try {
			db.get('SELECT * FROM users WHERE username = ?', username, (error, user) => {
				try {
					if (error) {
						logger.log('error', error)
						return
					}

					if (!user) {
						socket.emit('message', 'User does not exist')
						return
					}

					db.get('SELECT * FROM custom_polls WHERE id = ?', pollId, (error, poll) => {
						try {
							if (error) {
								logger.log('error', error)
								return
							}

							if (!poll) {
								socket.emit('message', 'Poll does not exist (please contact the programmer)')
								return
							}

							let name = 'Unnamed Poll'
							if (poll.name) name = poll.name
							else if (poll.prompt) name = poll.prompt

							db.get(
								'SELECT * FROM shared_polls WHERE pollId = ? AND userId = ?',
								[pollId, user.id],
								(error, sharePoll) => {
									try {
										if (error) {
											logger.log('error', error);
											return
										}

										if (sharePoll) {
											socket.emit('message', `${name} is Already Shared with ${username}`)
											return
										}

										db.run(
											'INSERT INTO shared_polls (pollId, userId) VALUES (?, ?)',
											[pollId, user.id],
											async (error) => {
												try {
													if (error) {
														logger.log('error', error)
														return
													}

													socket.emit('message', `Shared ${name} with ${username}`)

													getPollShareIds(pollId)

													let classCode = getUserClass(username)
													if (classCode) {
														cD[classCode].students[user.username].sharedPolls.push(pollId)

														customPollUpdate(username)
													}
												} catch (err) {
													logger.log("error", err)
												}
											}
										)
									} catch (err) {
										logger.log("error", err)
									}
								}
							)
						} catch (err) {
							logger.log("error", err)
						}
					})
				} catch (err) {
					logger.log('error', err)
				}
			})
		} catch (err) {
			logger.log("error", err)
		}
	})

	socket.on('removeUserPollShare', (pollId, userId) => {
		try {
			db.get(
				'SELECT * FROM shared_polls WHERE pollId = ? AND userId = ?',
				[pollId, userId],
				(error, pollShare) => {
					try {
						if (error) {
							logger.log('error', error)
							return
						}

						if (!pollShare) {
							socket.emit('message', 'Poll is not shared to this user')
							return
						}

						db.run(
							'DELETE FROM shared_polls WHERE pollId = ? AND userId = ?',
							[pollId, userId],
							(error) => {
								try {
									if (error) {
										logger.log('error', error)
										return
									}

									socket.emit('message', 'Successfully unshared user')
									getPollShareIds(pollId)

									db.get('SELECT * FROM users WHERE id = ?', userId, async (error, user) => {
										try {
											if (error) {
												logger.log('error', error)
												return
											} else if (user) {
												let classCode = getUserClass(user.username)
												if (!classCode) return

												let sharedPolls = cD[classCode].students[user.username].sharedPolls
												sharedPolls.splice(sharedPolls.indexOf(pollId), 1)
												customPollUpdate(user.username)
											}
										} catch (err) {
											logger.log("error", err)
										}
									})
								} catch (err) {
									logger.log("error", err)
								}
							}
						)
					} catch (err) {
						logger.log("error", err)
					}
				}
			)
		} catch (err) {
			logger.log('error', err)
		}
	})

	socket.on('getPollShareIds', (pollId) => {
		getPollShareIds(pollId)
	})

	socket.on('sharePollToClass', (pollId, classCode) => {
		try {
			db.get('SELECT * FROM classroom WHERE key = ?', classCode, (error, classroom) => {
				try {
					if (error) {
						logger.log('error', error)
						return
					}

					if (!classroom) {
						socket.emit('message', 'There is no class with that code.')
						return
					}

					db.get('SELECT * FROM custom_polls WHERE id = ?', pollId, (error, poll) => {
						try {
							if (error) {
								logger.log('error', error)
								return
							}

							if (!poll) {
								socket.emit('message', 'Poll does not exist (please contact the programmer)')
								return
							}

							let name = 'Unnamed Poll'
							if (poll.name) name = poll.name
							else if (poll.prompt) name = poll.prompt

							db.get(
								'SELECT * FROM class_polls WHERE pollId = ? AND classId = ?',
								[pollId, classroom.id],
								(error, sharePoll) => {
									try {
										if (error) {
											logger.log('error', error);
											return
										}

										if (sharePoll) {
											socket.emit('message', `${name} is Already Shared with that class`)
											return
										}

										db.run(
											'INSERT INTO class_polls (pollId, classId) VALUES (?, ?)',
											[pollId, classroom.id],
											async (error) => {
												try {
													if (error) {
														logger.log('error', error)
														return
													}

													socket.emit('message', `Shared ${name} with that class`)

													getPollShareIds(pollId)

													cD[classCode].sharedPolls.push(pollId)
													for (let username of Object.keys(cD[classCode].students)) {
														customPollUpdate(username)
													}
												} catch (err) {
													logger.log("error", err)
												}
											}
										)
									} catch (err) {
										logger.log("error", err)
									}
								}
							)
						} catch (err) {
							logger.log("error", err)
						}
					})
				} catch (err) {
					logger.log("error", err)
				}
			})
		} catch (err) {
			logger.log("error", err)
		}
	})

	socket.on('removeClassPollShare', (pollId, classId) => {
		try {
			db.get(
				'SELECT * FROM class_polls WHERE pollId = ? AND classId = ?',
				[pollId, classId],
				(error, pollShare) => {
					try {
						if (error) {
							logger.log('error', error)
							return
						}

						if (!pollShare) {
							socket.emit('message', 'Poll is not shared to this class')
							return
						}

						db.run(
							'DELETE FROM class_polls WHERE pollId = ? AND classId = ?',
							[pollId, classId],
							(error) => {
								try {
									if (error) {
										logger.log('error', error)
										return
									}

									socket.emit('message', 'Successfully unshared class')
									getPollShareIds(pollId)

									db.get('SELECT * FROM classroom WHERE id = ?', classId, async (error, classroom) => {
										try {
											if (error) {
												logger.log('error', error)
												return
											}

											if (classroom) {
												if (!cD[classroom.key]) return

												let sharedPolls = cD[classroom.key].sharedPolls
												sharedPolls.splice(sharedPolls.indexOf(pollId), 1)
												for (let username of Object.keys(cD[classroom.key].students)) {
													customPollUpdate(username)
												}
											}
										} catch (err) {
											logger.log('error', err)
										}
									})
								} catch (err) {
									logger.log("error", err)
								}
							}
						)
					} catch (err) {
						logger.log("error", err)
					}
				}
			)
		} catch (err) {
			logger.log("error", err)
		}
	})

	// Sends a help ticket
	socket.on('help', (reason, time) => {
		try {
			logger.info(`${socket.handshake.address}, ${socket.request.session.username}, ${reason}, ${time}`);
			cD[socket.request.session.class].students[socket.request.session.username].help = { reason: reason, time: time }
			cpUpdate();
		} catch (err) {
			logger.log('error', err)
		}
	});

	// Sends a break ticket
	socket.on('requestBreak', (reason) => {
		try {
			let student = cD[socket.request.session.class].students[socket.request.session.username]
			student.break = reason
			cpUpdate()
		} catch (err) {
			logger.log('error', err)
		}
	})

	// Aproves the break ticket request
	socket.on('approveBreak', (breakApproval, username) => {
		try {
			let student = cD[socket.request.session.class].students[username]
			student.break = breakApproval
			if (breakApproval) io.to(username).emit('break')
			cpUpdate()
			vbUpdate()
		} catch (err) {
			logger.log('error', err)
		}
	})

	// Ends the break
	socket.on('endBreak', () => {
		try {
			let student = cD[socket.request.session.class].students[socket.request.session.username]
			student.break = false

			cpUpdate()
			vbUpdate()
		} catch (err) {
			logger.log('error', err)
		}
	})

	// Deletes a user from the class
	socket.on('deleteStudent', (username) => {
		try {
			const classCode = socket.request.session.class
			deleteStudent(username, classCode)
			cpUpdate(classCode)
			vbUpdate(classCode)
		} catch (err) {
			logger.log('error', err)
		}
	})

	// Deletes all students from the class
	socket.on('deleteStudents', () => {
		try {
			const classCode = socket.request.session.class
			deleteStudents(classCode)
			cpUpdate(classCode)
			vbUpdate(classCode)
		} catch (err) {
			logger.log('error', err)
		}
	})

	socket.on('leaveClass', () => {
		try {
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
					if (err) {
						logger.log('error', err)
					}
					else if (classroom) {
						endClass(classroom.key)
					}
				}
			)
		} catch (err) {
			logger.log('error', err)
		}
	})

	socket.on('logout', () => {
		try {
			const username = socket.request.session.username
			const userId = socket.request.session.userId
			const classCode = socket.request.session.class
			const className = cD[classCode].className
			socket.request.session.destroy((err) => {
				try {
					if (err) {
						logger.log('error', err)
						return
					}

					delete userSockets[username]
					delete cD[classCode].students[username]
					socket.leave(className)
					cpUpdate(classCode)
					vbUpdate(classCode)
					db.get(
						'SELECT * FROM classroom WHERE owner=? AND key=?',
						[userId, classCode],
						(err, classroom) => {
							if (err) {
								logger.log('error', err)
							} else if (classroom) {
								endClass(classroom.key)
							}
						}
					)
				} catch (err) {
					logger.log('error', err)
				}
			})
		} catch (err) {
			logger.log('error', err)
		}
	})

	socket.on('endClass', () => {
		try {
			const userId = socket.request.session.userId
			const classCode = socket.request.session.class
			db.get(
				'SELECT * FROM classroom WHERE owner=? AND key=?',
				[userId, classCode],
				(err, classroom) => {
					try {
						if (err) {
							logger.log('error', err);
						} else if (classroom) {
							endClass(classroom.key)
						}
					} catch (err) {
						logger.log('error', err)
					}
				}
			)
		} catch (err) {
			logger.log('error', err)
		}
	})

	socket.on('deleteClass', (classId) => {
		try {
			db.get('SELECT * FROM classroom WHERE id = ?', classId, (err, classroom) => {
				try {
					if (err) {
						logger.log('error', err)
					} else if (classroom) {
						if (cD[classroom.key]) {
							endClass(classroom.key)
						}
						db.run('DELETE FROM classroom WHERE id = ?', classroom.id)
						db.run('DELETE FROM classusers WHERE classuid = ?', classroom.id)
						db.run('DELETE FROM poll_history WHERE class = ?', classroom.id)
					}
					getOwnedClasses(socket.request.session.username)
				} catch (err) {
					logger.log('error', err)
				}
			})
		} catch (err) {
			logger.log('error', err)
		}
	})

	// Joins a classroom for websocket usage
	socket.on('joinRoom', (className) => {
		try {
			socket.join(className)
			socket.request.session.class = className
			socket.emit('joinRoom', socket.request.session.class)
			vbUpdate()
		} catch (err) {
			logger.log('error', err)
		}
	})

	socket.on('leaveRoom', (className) => {
		try {
			socket.leave(className)
			vbUpdate()
		} catch (err) {
			logger.log('error', err)
		}
	})

	// Updates and stores poll history
	socket.on('cpUpdate', () => {
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
			db.get('SELECT data FROM poll_history WHERE id = ?', pollindex, (err, pollData) => {
				try {
					if (err) {
						logger.log('error', err)
					} else {
						io.to(socket.request.session.class).emit('previousPollData', JSON.parse(pollData.data))
					}
				} catch (err) {
					logger.log('error', err)
				}
			})
		} catch (err) {
			logger.log('error', err)
		}
	})

	// Moves to the next step
	socket.on('doStep', (index) => {
		try {
			// send reload to whole class
			socket.broadcast.to(socket.request.session.class).emit('reload')
			cD[socket.request.session.class].currentStep++
			if (cD[socket.request.session.class].steps[index] !== undefined) {
				// Creates a poll based on the step data
				if (cD[socket.request.session.class].steps[index].type == 'poll') {

					cD[socket.request.session.class].mode = 'poll'

					if (cD[socket.request.session.class].poll.status == true) {
						cD[socket.request.session.class].poll.responses = {}
						cD[socket.request.session.class].poll.prompt = ""
						cD[socket.request.session.class].poll.status = false
					};

					cD[socket.request.session.class].poll.status = true
					// Creates an object for every answer possible the teacher is allowing
					for (let i = 0; i < cD[socket.request.session.class].steps[index].responses; i++) {
						if (cD[socket.request.session.class].steps[index].labels[i] == '' || cD[socket.request.session.class].steps[index].labels[i] == null) {
							let letterString = "abcdefghijklmnopqrstuvwxyz"
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
							if (err) {
								logger.log('error', err)
							}
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
							if (err) {
								logger.log('error', err)
							}
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
			logger.log('error', err)
		}
	})

	// Check later, there's already a socket.on for previousPollDisplay
	socket.on('previousPollDisplay', (pollindex) => {
		try {
			db.get('SELECT data FROM poll_history WHERE id = ?', pollindex, (err, pollData) => {
				try {
					if (err) {
						logger.log('error', err)
						return
					}

					io.to(socket.request.session.class).emit('previousPollData', JSON.parse(pollData.data))
				} catch (err) {
					logger.log('error', err)
				}
			})
		} catch (err) {
			logger.log('error', err)
		}
	})

	// Deletes help ticket
	socket.on('deleteTicket', (student) => {
		try {
			cD[socket.request.session.class].students[student].help = ''
		} catch (err) {
			logger.log('error', err)
		}
	})

	// Changes the class mode
	socket.on('modechange', (mode) => {
		try {
			cD[socket.request.session.class].mode = mode
			modeUpdate()
		} catch (err) {
			logger.log('error', err)
		}
	})

	socket.on('pluginUpdate', () => {
		pluginUpdate()
	})

	socket.on('changePlugin', (id, name, url) => {
		try {
			if (name) {
				db.run(
					'UPDATE plugins set name=? WHERE id=?',
					[name, id],
					(error) => {
						if (error) {
							logger.log('error', error)
							return
						}
						pluginUpdate()
					}
				)
			} else if (url) {
				db.run('UPDATE plugins set url=? WHERE id=?', [url, id], (error) => {
					if (error) {
						logger.log('error', error)
						return
					}
					pluginUpdate()
				})
			}
		} catch (err) {
			logger.log('error', err)
		}
	})

	socket.on('addPlugin', (name, url) => {
		try {
			db.get(
				'SELECT * FROM classroom WHERE key = ?',
				[socket.request.session.class],
				(error, classData) => {
					try {
						if (error) {
							logger.log('error', error)
							return
						}

						db.run(
							'INSERT INTO plugins(name, url, classuid) VALUES(?, ?, ?)',
							[name, url, classData.id]
						)
						pluginUpdate()
					} catch (err) {
						logger.log('error', err)
					}
				}
			)
		} catch (err) {
			logger.log('error', err)
		}
	})

	socket.on('removePlugin', (id) => {
		try {
			db.run('DELETE FROM plugins WHERE id=?', [id])
			pluginUpdate()
		} catch (err) {
			logger.log('error', err)
		}
	})

	socket.on('getOwnedClasses', (username) => {
		getOwnedClasses(username)
	})

	// sends the class code of the class a user is in
	socket.on('getUserClass', ({ username, api }) => {
		function getClass(username) {
			try {
				for (let className of Object.keys(cD)) {
					if (cD[className].students[username]) {
						if (className == 'noClass') return socket.emit('getUserClass', { error: 'user is not in a class' })
						else return socket.emit('getUserClass', className)
					}
				}
				socket.emit('getUserClass', { error: 'user is not logged in' })
			} catch (err) {
				logger.log('error', err)
			}
		}

		try {
			if (api) {
				db.get('SELECT * FROM users WHERE API = ?', [api], (error, userData) => {
					if (error) {
						logger.log('error', error)
						return
					}

					if (!userData) {
						socket.emit('getUserClass', { error: 'not a valid API Key' })
						return
					}

					getClass(userData.username)
				}
				)
			} else if (username) {
				let classCode = getUserClass(username)

				if (!classCode) socket.emit('getUserClass', { error: 'user is not logged in' })
				else if (classCode == 'noClass') socket.emit('getUserClass', { error: 'user is not in a class' })
				else socket.emit('getUserClass', className)
			}
			else socket.emit('getUserClass', { error: 'missing username or api key' })
		} catch (err) {
			logger.log('error', err)
		}
	})
})


http.listen(420, () => {
	console.log('Running on port: 420')
})