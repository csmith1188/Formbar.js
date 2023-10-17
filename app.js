// Imported modules
const express = require('express')
const session = require('express-session') //For storing client login data
const { encrypt, decrypt } = require('./static/js/crypto.js') //For encrypting passwords
const sqlite3 = require('sqlite3').verbose()
const jwt = require('jsonwebtoken') //For authentication system between Formbot/other bots and Formbar
const excelToJson = require('convert-excel-to-json')
const multer = require('multer')//Used to upload files
const upload = multer({ dest: 'uploads/' }) //Selects a file destination for uploaded files to go to, will create folder when file is submitted(?)
const crypto = require('crypto')
const { writeFileSync } = require('fs')
const { dirname } = require('path')

var app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)


// Set EJS as our view engine
app.set('view engine', 'ejs')


// Create session for user information to be transferred from page to page
var sessionMiddleware = session({
	secret: 'secret', //Used to sign into the session via cookies
	resave: false, //Used to prevent resaving back to the session store, even if it wasn't modified
	saveUninitialized: false //Forces a session that is new, but not modified, or "uninitialized" to be saved to the session store
})


// PROMPT: What does this do?
// Sets up middleware for the server by calling sessionMiddleware
// adds session middleware to express
app.use(sessionMiddleware)


// PROMPT: Does this allow use to associate client logins with their websocket connection?
// PROMPT: Where did you find information on this. Please put the link here.
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
app.use('/js/iro.js', express.static(__dirname + '/node_modules/@jaames/iro/dist/iro.min.js'));
app.use('/js/floating-ui-core.js', express.static(__dirname + '/node_modules/@floating-ui/core/dist/floating-ui.core.umd.min.js'));
app.use('/js/floating-ui-dom.js', express.static(__dirname + '/node_modules/@floating-ui/dom/dist/floating-ui.dom.umd.min.js'));

// Establishes the connection to the database file
var db = new sqlite3.Database('database/database.db')

//cD is the class dictionary, it stores all of the information on classes and students
var cD = {
	noClass: { students: {} }
}


// This class is used to create a student to be stored in the sessions data
class Student {
	// Needs username, id from the database, and if perms established already pass the updated value
	// These will need to be put into the constructor in order to allow the creation of the object
	constructor(username, id, perms = 2, API) {
		this.username = username
		this.id = id
		this.permissions = perms
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
	constructor(className, key) {
		this.className = className
		this.students = {}
		this.poll = {
			status: false,
			responses: [],
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
		this.quizObj = false
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

//Permssion level needed to access each page
const pagePermissions = {
	controlPanel: 0,
	chat: 2,
	poll: 2,
	virtualbar: 2,
	makeQuiz: 0,
	bgm: 2,
	sfx: 2
}




// Functions
//-----------
//Clears the database
//Removes all users, teachers, and classes
//ONLY USE FOR TESTING PURPOSES
function clearDatabase() {
	db.get(`DELETE FROM users`, (err) => {
		if (err) {
			console.log(err)
		}
	})
}

/*
Check if user has logged in
Place at the start of any page that needs to verify if a user is logged in or not
This allows websites to check on their own if the user is logged in
This also allows for the website to check for perms
*/
function isAuthenticated(req, res, next) {
	if (req.session.user) {
		if (cD.noClass.students[req.session.user]) {
			if (cD.noClass.students[req.session.user].permissions == 0) {
				res.redirect('/createclass')
			} else {
				res.redirect('/selectclass')
			}
		} else {
			next()
		}

	} else {
		res.redirect('/login')
	}
}

// Check if user is logged in. Only used for create and select class pages
// Use isAuthenticated function for any other pages
// Created for the first page since there is no check before this
// This allows for a first check in where the user gets checked by the webpage
function isLoggedIn(req, res, next) {
	if (req.session.user) {
		next()
	} else {
		res.redirect('/login')
	}
}

// Check if user has the permission levels to enter that page
function permCheck(req, res, next) {
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
		// Checks if users permnissions are high enough
		if (cD[req.session.class].students[req.session.user].permissions <= pagePermissions[urlPath]) {
			next()
		} else {
			res.render('pages/message', {
				message: "Error: you don't have high enough permissions to access this page",
				title: 'Error'
			})
		}
	}
}

// Allows the user to join a class
function joinClass(userName, code) {
	return new Promise((resolve, reject) => {
		// Find the id of the class from the database
		db.get(`SELECT id FROM classroom WHERE key=?`, [code], (err, id) => {
			if (err) {
				console.log(err)
				res.render('pages/message', {
					message: "Error: something went wrong",
					title: 'Error'
				})
			}
			// Check to make sure there was a class with that name
			if (id && cD[code] && cD[code].key == code) {
				// Find the id of the user who is trying to join the class
				db.get(`SELECT id FROM users WHERE username=?`, [userName], (err, uid) => {
					if (err) {
						console.log(err)
					}
					// Add the two id's to the junction table to link the user and class
					db.get('SELECT * FROM classusers WHERE classuid = ? AND studentuid = ?',
						[id.id, uid.id],
						(error, classUser) => {
							if (error) console.log(error)
							if (typeof classUser == 'undefined') {
								db.run(`INSERT INTO classusers(classuid, studentuid, permissions, digiPogs) VALUES(?, ?, ?, ?)`,
									[id.id, uid.id, 2, 0], (err) => {
										if (err) {
											console.log(err)
										}
									}
								)
							}
							// Get the student's session data ready to transport into new class
							var user = cD.noClass.students[userName]
							if (classUser) user.permissions = classUser.permissions
							else user.permissions = 2
							// Remove student from old class
							delete cD.noClass.students[userName]
							// Add the student to the newly created class
							cD[code].students[userName] = user
							resolve(true)
						}
					)
				})
			} else {
				resolve(false)
			}
		})
	})
}

// Function to convert HSL to Hex
function convertHSLToHex(hue, saturation, lightness) {
	// Normalize lightness to range 0-1
	lightness /= 100;

	// Calculate chroma
	const chroma = saturation * Math.min(lightness, 1 - lightness) / 100;

	// Function to get color component
	function getColorComponent(colorIndex) {
		const colorPosition = (colorIndex + hue / 30) % 12;
		const colorValue = lightness - chroma * Math.max(Math.min(colorPosition - 3, 9 - colorPosition, 1), -1);

		// Return color component in hexadecimal format
		return Math.round(255 * colorValue).toString(16).padStart(2, '0');
	};

	// Return the hex color
	return `#${getColorComponent(0)}${getColorComponent(8)}${getColorComponent(4)}`;
}

// Function to generate colors
function generateColors(amount) {
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
	res.redirect('/home')
})


// A
//The page displaying the API key used when handling oauth2 requests from outside programs such as FORMBOT - Riley R., May 22, 2023
app.get('/apikey', isAuthenticated, (req, res) => {
	res.render('pages/APIKEY', {
		title: "API KEY",
		API: cD[req.session.class].students[req.session.user].API
	})
})

// B

// C


// An endpoint for the teacher to control the formbar
// Used to update students permissions, handle polls and their corresponsing responses
// On render it will send all students in that class to the page
app.get('/controlPanel', isAuthenticated, permCheck, (req, res) => {
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
		students: allStuds,
		pollStatus: cD[req.session.class].poll.status,
		key: cD[req.session.class].key.toUpperCase(),
		steps: cD[req.session.class].steps,
		currentStep: cD[req.session.class].currentStep
	})

})

// C

/*
Manages the use of excell spreadsheets in order to create progressive lessons.
It uses Excel To JSON to create an object containing all the data needed for a progressive lesson.
Could use a switch if need be, but for now it's all broken up by if statements.
Use the provided template when testing things. - Riley R., May 22, 2023
*/
app.post('/controlPanel', upload.single('spreadsheet'), isAuthenticated, permCheck, (req, res) => {
	ï
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
			sourceFile: `${req.file.path}`,
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
					sourceFile: `${req.file.path}`,
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
					sourceFile: `${req.file.path}`,
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
})


// Loads which classes the teacher is an owner of
// This allows the teacher to be in charge of all classes
// The teacher can give any perms to anyone they desire, which is useful at times
// This also allows the teacher to kick or ban if needed
app.get('/createclass', isLoggedIn, (req, res) => {
	var ownerClasses = []
	// Finds all classes the teacher is the owner of
	db.all(`SELECT name FROM classroom WHERE owner=?`,
		[req.session.user], (err, rows) => {
			rows.forEach(row => {
				ownerClasses.push(row.name)
			})
			res.render('pages/createclass', {
				title: 'Create Class',
				ownerClasses: ownerClasses
			})
		})
})

// Allow teacher to create class
// Allowing the teacher to create classes is vital to whether the lesson actually works or not, because they have to be allowed to create a teacher class
// This will allow the teacher to give students student perms, and guests student perms as well
// Plus they can ban and kick as long as they can create classes
app.post('/createclass', isLoggedIn, (req, res) => {
	let submittionType = req.body.submittionType
	let className = req.body.name.toLowerCase()
	function makeClass(key) {
		// Get the teachers session data ready to transport into new class
		var user = cD.noClass.students[req.session.user]
		// Remove teacher from old class
		delete cD.noClass.students[req.session.user]
		// Add class into the session data
		cD[key] = new Classroom(className, key)
		// Add the teacher to the newly created class
		cD[key].students[req.session.user] = user
		req.session.class = key

		res.redirect('/home')
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
		db.run(`INSERT INTO classroom(name, owner, key) VALUES(?, ?, ?)`,
			[className, req.session.user, key], (err) => {
				if (err) {
					console.log(err)
				}
			})
		makeClass(key)
	} else {
		db.get(`SELECT key FROM classroom WHERE name=?`, [className], (err, classCode) => {
			if (err) {
				console.log(err)
			}
			makeClass(classCode.key)
		})
	}
})

// D
// Clears the database, this deletes the database
// This will allow for the server to be reset so new things can be tested
// This is purely for testing purposes, and will be removed in the future
// Clearing the database removes all permissions and makes you manually reset them
app.get('/delete', (req, res) => {
	clearDatabase()
})

// E

// F

// G

// H
// This is the home page, where the teacher and students can access can access the formbar js
// It also shows the color and title of the formbar js
// It renders the home page so teachers and students can navigate to it
// It uses the authenitication to make sure the user is actually logged in
app.get('/home', isAuthenticated, (req, res) => {
	res.render('pages/index', {
		title: 'Home'
	})
})


app.get('/help', isAuthenticated, (req, res) => {
	res.render('pages/help', {
		title: "Help"
	})
})

// I

// J

// K

// L
/* Allows the user to view previous lessons created, they are stored in the database- Riley R., May 22, 2023 */
app.get('/previousLessons', isAuthenticated, (req, res) => {
	db.all(`SELECT * FROM lessons WHERE class=?`, cD[req.session.class].className, async (err, rows) => {
		if (err) {
			console.log(err)
		} else if (rows) {
			res.render('pages/previousLesson', {
				rows: rows,
				title: "Previous Lesson"
			})

		}

	})
})

app.post('/previousLessons', (req, res) => {
	let lesson = JSON.parse(req.body.data)
	res.render('pages/lesson', {
		lesson: lesson,
		title: "Today's Lesson"
	})
})
// This renders the login page
// It displays the title and the color of the login page of the formbar js
// It allows for the login to check if the user wants to login to the server
// This makes sure the lesson can see the students and work with them
app.get('/login', (req, res) => {
	res.render('pages/login', {
		title: 'Login'
	})
})

// This lets the user log into the server, it uses each element from the database to allow the server to do so
// This lets users actually log in instead of not being able to log in at all
// It uses the usernames, passwords, etc. to verify that it is the user that wants to log in logging in
// This also encrypts passwords to make sure people's accounts don't get hacked
app.post('/login', async (req, res) => {
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
		db.get(`SELECT * FROM users WHERE username=?`, [user.username], async (err, rows) => {
			if (err) {
				console.log(err)
			}
			// Check if a user with that name was found in the database
			if (rows) {
				// Decrypt users password
				let tempPassword = decrypt(JSON.parse(rows.password))
				if (rows.username == user.username && tempPassword == user.password) {
					// Add user to the session
					cD.noClass.students[rows.username] = new Student(rows.username, rows.id, rows.permissions, rows.API)
					// Add a cookie to transfer user credentials across site
					req.session.user = rows.username
					if (req.body.classKey) {
						req.session.class = req.body.classKey
						let checkJoin
						try {
							checkJoin = await joinClass(user.username, cD[req.body.classKey].key)
							if (checkJoin) {
								res.json({ login: true })
							} else (
								res.json({ login: false })
							)
						} catch (err) {
							res.json({ login: false })
						}

					} else {
						res.redirect('/')
					}
				} else {
					res.redirect('/login')
				}
			} else {
				res.redirect('/login')
			}
		})

	} else if (user.loginType == "new") {
		let permissions = 2

		db.all('SELECT API, secret FROM users', (error, users) => {
			if (error) console.log(error)
			else {
				let existingAPIs = []
				let existingSecrets = []
				let newAPI
				let newSecret

				if (users.length == 0) permissions = 0

				for (let user of users) {
					existingAPIs.push(user.API)
					existingSecrets.push(user.secret)
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
							console.log(err)
						}
					})
				// Find the user in which was just created to get the id of the user
				db.get(`SELECT * FROM users WHERE username=?`, [user.username], (err, rows) => {
					if (err) {
						console.log(err)
					} else {
						// Add user to session
						cD.noClass.students[rows.username] = new Student(rows.username, rows.id, rows.permissions, rows.API)
						// Add the user to the session in order to transfer data between each page
						req.session.user = rows.username
						res.redirect('/')
					}
				})
			}
		})
	} else if (user.loginType == "guest") {

	}
})

// M

// N

// O
/* This is what happens when the server tries to authenticate a user. It saves the redirectURL query parameter to a variable, and sends the redirectURL to the oauth page as
a variable. */
app.get('/oauth', (req, res) => {
	let redirectURL = req.query.redirectURL
	res.render('pages/oauth.ejs', {
		title: "Oauth",
		redirectURL: redirectURL
	})
})

// This is what happens after the user submits their authentication data.
app.post('/oauth', (req, res) => {
	// It saves the username, password, and the redirectURL that is submitted.
	const {
		username,
		password,
		redirectURL
	} = req.body
	// If there is a username and password submitted, then it gets results from the database that match the username.
	if (username && password) {
		db.get(`SELECT * FROM users WHERE username = ?`, [username], (error, userData) => {
			if (error) console.log(error)
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
		})
		// If either a username, password, or both is not returned, then it redirects back to the oauth page.
	} else res.redirect(`/oauth?redirectURL=${redirectURL}`)
})

// P
app.get('/plugins', isAuthenticated, (req, res) => {
	res.render('pages/plugins.ejs',
		{
			title: 'Plugins'
		})
})

// Q



// R


// S

// selectclass
//Send user to the select class page
app.get('/selectclass', isLoggedIn, (req, res) => {
	res.render('pages/selectclass', {
		title: 'Select Class'
	})
})


//Adds user to a selected class, typically from the select class page
app.post('/selectclass', isLoggedIn, async (req, res) => {
	let code = req.body.key.toLowerCase()
	let checkComplete = await joinClass(req.session.user, code)
	if (checkComplete) {
		req.session.class = code
		res.redirect('/home')
	} else {
		// res.send('Error: no open class with that name')
		res.render('pages/message', {
			message: "Error: no open class with that name",
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
app.get('/student', isAuthenticated, (req, res) => {
	//Poll Setup
	let user = {
		name: req.session.user,
		class: req.session.class
	}

	let posPollRes = cD[req.session.class].poll.responses
	let answer = req.query.letter

	if (answer) {
		cD[req.session.class].students[req.session.user].pollRes.buttonRes = answer
		db.get('UPDATE users SET pollRes = ? WHERE username = ?', [answer, req.session.user])
	}

	//Quiz Setup and Queries
	/* Sets up the query parameters you can enter when on the student page. These return either a question by it's index or a question by a randomly generated index.

	formbar.com/students?question=random or formbar.com/students?question=[number] are the params you can enter at the current moment.

	If you did not enter a query the page will be loaded normally. - Riley R., May 24, 2023
	*/
	if (req.query.question == 'random') {
		let random = Math.floor(Math.random() * cD[req.session.class].quizObj.questions.length)
		res.render('pages/queryquiz', {
			quiz: JSON.stringify(cD[req.session.class].quizObj.questions[random]),
			title: "Quiz"
		})
		if (cD[req.session.class].quizObj.questions[req.query.question] != undefined) {
			res.render('pages/queryquiz', {
				quiz: JSON.stringify(cD[req.session.class].quizObj.questions[random]),
				title: "Quiz"
			})
		}
	} else if (isNaN(req.query.question) == false) {
		if (cD[req.session.class].quizObj.questions[req.query.question] != undefined) {
			res.render('pages/queryquiz', {
				quiz: JSON.stringify(cD[req.session.class].quizObj.questions[req.query.question]),
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
			pollStatus: cD[req.session.class].poll.status,
			posPollRes: JSON.stringify(cD[req.session.class].poll.responses),
			posTextRes: JSON.stringify(cD[req.session.class].poll.textRes),
			myRes: cD[req.session.class].students[req.session.user].pollRes.buttonRes,
			myTextRes: cD[req.session.class].students[req.session.user].pollRes.textRes,
			pollPrompt: cD[req.session.class].poll.prompt,
			quiz: JSON.stringify(cD[req.session.class].quizObj),
			lesson: cD[req.session.class].lesson,
			mode: cD[req.session.class].mode
		})
	}
})

/* This is for when you send poll data via a post command or when you submit a quiz.
If it's a poll it'll save your response to the student object and the database.
- Riley R., May 24, 2023
*/
app.post('/student', (req, res) => {
	if (req.query.poll) {
		let answer = req.body.poll
		if (answer) {
			cD[req.session.class].students[req.session.user].pollRes.buttonRes = answer
			db.get('UPDATE users SET pollRes = ? WHERE username = ?', [answer, req.session.user])
		}
		res.redirect('/poll')
	}
	if (req.body.question) {
		let results = req.body.question
		let totalScore = 0
		for (let i = 0; i < cD[req.session.class].quizObj.questions.length; i++) {
			if (results[i] == cD[req.session.class].quizObj.questions[i][1]) {
				totalScore += cD[req.session.class].quizObj.pointsPerQuestion
			} else {
				continue
			}
		}
		cD[req.session.class].students[req.session.user].quizScore = Math.floor(totalScore) + '/' + cD[req.session.class].quizObj.totalScore

		res.render('pages/results', {
			totalScore: Math.floor(totalScore),
			maxScore: cD[req.session.class].quizObj.totalScore,
			title: "Results"
		})
	}
})


// T

// U

// V
app.get('/virtualbar', isAuthenticated, permCheck, (req, res) => {
	if (req.query.bot == "true") {
		res.json(cD[req.session.class])
	} else {
		res.render('pages/virtualbar', {
			title: 'Virtual Bar',
			io: io,
			className: cD[req.session.class].className
		})
	}
})

// W

// X

// Y

// Z

// 404
app.use((req, res, next) => {
	res.status(404).render('pages/message', {
		message: "Error: page does not exist",
		title: "Error"
	})
})


// Middleware for sockets
// Authentication for users and bots to connect to formbar websockets
// The user must be logged in order to connect to websockets
io.use((socket, next) => {
	let { api, classCode } = socket.request._query
	if (socket.request.session.user) {
		next()
	} else if (api) {
		socket.request.session.api = api
		socket.request.session.class = classCode
		if (!cD[socket.request.session.class]) return next(new Error("class not started"))
		db.get(
			'SELECT id, username, permissions FROM users WHERE API = ?',
			[api],
			(error, userData) => {
				if (error) {
					return next(error)
				}
				if (!userData) return next(new Error('not a valid API Key'))
				next()
			}
		)
	} else {
		next(new Error("missing user or api"))
	}
})

let rateLimits = {}

//Handles the websocket communications
io.on('connection', (socket) => {
	if (socket.request.session.user) {
		socket.join(cD[socket.request.session.class].className)
		socket.join(socket.request.session.user)
	}
	if (socket.request.session.api) {
		socket.join(cD[socket.request.session.class].className)
	}

	//rate limiter
	socket.use((packet, next) => {
		const user = socket.request.session.user
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
				userRequests[requestType].shift()
			}, blockTime)
		} else {
			userRequests[requestType].push(now)
			next()
		}
	})

	function cpupdate() {
		db.all(`SELECT * FROM poll_history WHERE class=?`, cD[socket.request.session.class].key, async (err, rows) => {
			var pollHistory = rows
			io.to(cD[socket.request.session.class].className).emit('cpupdate', JSON.stringify(cD[socket.request.session.class]), JSON.stringify(pollHistory))
		})
	}

	function vbUpdate() {
		let classData = JSON.parse(JSON.stringify(cD[socket.request.session.class]))//Object.assign({}, cD[socket.request.session.class])

		let responses = {}

		for (let [username, student] of Object.entries(classData.students)) {
			if (student.break == true || student.permissions == 0) delete classData.students[username]
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

		io.to(cD[socket.request.session.class].className).emit('vbUpdate', {
			status: classData.poll.status,
			totalStudents: Object.keys(classData.students).length,
			polls: responses,
			textRes: classData.poll.textRes,
			prompt: classData.poll.prompt,
			weight: classData.poll.weight,
			blind: classData.poll.blind
		})
	}

	function pluginUpdate() {
		db.all(
			'SELECT plugins.id, plugins.name, plugins.url FROM plugins JOIN classroom ON classroom.key = ?',
			[socket.request.session.class],
			(error, plugins) => {
				if (error) console.log(error)
				io.emit('pluginUpdate', plugins)
			}
		)
	}

	// /poll websockets for updating the database
	socket.on('pollResp', function (res, textRes, resWeight, resLength) {
		cD[socket.request.session.class].students[socket.request.session.user].pollRes.buttonRes = res
		cD[socket.request.session.class].students[socket.request.session.user].pollRes.textRes = textRes
		db.get('UPDATE users SET pollRes = ? WHERE username = ?', [res, socket.request.session.user])
		for (let i = 0; i < resLength; i++) {
			if (res) {
				let calcWeight = cD[socket.request.session.class].poll.weight * resWeight
				cD[socket.request.session.class].students[socket.request.session.user].pogMeter += calcWeight
				if (cD[socket.request.session.class].students[socket.request.session.user].pogMeter >= 25) {
					db.get('GET digipogs FROM classusers WHERE studentid = ?', [cD[socket.request.session.class].students[socket.request.session.user].id], (error, data) => {
						db.get('UPDATE classusers SET digiPogs = ? WHERE studentuid = ?', [data + 1, cD[socket.request.session.class].students[socket.request.session.user].id])
					})
					cD[socket.request.session.class].students[socket.request.session.user].pogMeter = 0
				};
			}
		}
	})
	// Changes Permission of user. Takes which user and the new permission level
	socket.on('permChange', (user, res) => {
		cD[socket.request.session.class].students[user].permissions = res
		if (cD[socket.request.session.class]) {
			db.get(
				'SELECT id FROM classroom WHERE name = ?',
				[cD[socket.request.session.class].className],
				(error, classId) => {
					if (error) console.log(error)
					if (classId) {
						classId = classId.id
						db.run('UPDATE classusers SET permissions = ? WHERE classuid = ? AND studentuid = ?', [res, classId, cD[socket.request.session.class].students[user].id])
					}
				}
			)
		}
		else
			db.run('UPDATE users SET permissions = ? WHERE username = ?', [res, user])
	})
	// Starts a new poll. Takes the number of responses and whether or not their are text responses
	socket.on('startPoll', function (resNumber, resTextBox, pollPrompt, polls, blind, weight) {
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
		cD[socket.request.session.class].poll.response

		for (var key in cD[socket.request.session.class].students) {
			cD[socket.request.session.class].students[key].pollRes.buttonRes = ""
			cD[socket.request.session.class].students[key].pollRes.textRes = ""
		}

		vbUpdate()
	})

	// End the current poll. Does not take any arguments
	socket.on('endPoll', () => {
		let data = { prompt: '', names: [], letter: [], text: [] }

		let dateConfig = new Date()
		let date = `${dateConfig.getMonth() + 1}.${dateConfig.getDate()}.${dateConfig.getFullYear()}`

		data.prompt = cD[socket.request.session.class].poll.prompt
		for (const key in cD[socket.request.session.class].students) {
			data.names.push(cD[socket.request.session.class].students[key].username)
			data.letter.push(cD[socket.request.session.class].students[key].pollRes.buttonRes)
			data.text.push(cD[socket.request.session.class].students[key].pollRes.textRes)
		}

		db.run(`INSERT INTO poll_history(class, data, date) VALUES(?, ?, ?)`,
			[cD[socket.request.session.class].key, JSON.stringify(data), date], (err) => {
				if (err) {
					console.log(err)
				}
			})

		cD[socket.request.session.class].poll.responses = {}
		cD[socket.request.session.class].poll.prompt = ''
		cD[socket.request.session.class].poll.status = false
		vbUpdate()
	})

	// Reloads any page with the reload function on. No arguments
	socket.on('reload', () => {
		io.emit('reload')
	})

	// Sends poll and student response data to client side virtual bar
	socket.on('vbUpdate', () => {
		vbUpdate()
	})
	// Sends a help ticket
	socket.on('help', (reason, time) => {
		cD[socket.request.session.class].students[socket.request.session.user].help = { reason: reason, time: time }
	})
	// Sends a break ticket
	socket.on('requestBreak', (reason) => {
		let student = cD[socket.request.session.class].students[socket.request.session.user]
		student.break = reason
		cpupdate()
	})
	// Aproves the break ticket request
	socket.on('approveBreak', (breakApproval, username) => {
		let student = cD[socket.request.session.class].students[username]
		student.break = breakApproval
		if (breakApproval) io.to(username).emit('break')
		cpupdate()
		vbUpdate()
	})
	// Ends the break
	socket.on('endBreak', () => {
		let student = cD[socket.request.session.class].students[socket.request.session.user]
		student.break = false

		cpupdate()
		vbUpdate()
	})
	// Deletes a user from the class
	socket.on('deleteUser', (userName) => {
		cD.noClass.students[userName] = cD[socket.request.session.class].students[userName]
		delete cD[socket.request.session.class].students[userName]
	})
	// Joins a classroom for websocket usage
	socket.on('joinRoom', (className) => {
		socket.join(className)
		vbUpdate()
	})
	// Updates and stores poll history
	socket.on('cpupdate', () => {
		cpupdate()
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

	// Starts a quick poll
	socket.on('botPollStart', (answerNumber) => {
		answerNames = []
		weight = 1
		answerWeights = []
		cD[socket.request.session.class].poll.status = true
		// Creates an object for every answer possible the teacher is allowing
		for (let i = 0; i < answerNumber; i++) {
			if (answerNames[i] == '' || answerNames[i] == null) {
				let letterString = "abcdefghijklmnopqrstuvwxyz"
				cD[socket.request.session.class].poll.responses[letterString[i]] = { answer: 'Answer ' + letterString[i], weight: 1 }
			} else {
				cD[socket.request.session.class].poll.responses[answerNames[i]] = { answer: answerNames[i], weight: answerWeights[i] }
			}
		}
		cD[socket.request.session.class].poll.textRes = false
		cD[socket.request.session.class].poll.prompt = "Quick Poll"
	})
	// Displays previous polls
	socket.on('previousPollDisplay', (pollindex) => {
		db.get('SELECT data FROM poll_history WHERE id = ?', pollindex, (err, pollData) => {
			if (err) {
				console.error(err)
			} else {
				io.to(cD[socket.request.session.class].className).emit('previousPollData', JSON.parse(pollData.data))
			}
		})

	})

	// Moves to the next step
	socket.on('doStep', (index) => {
		// send reload to whole class
		io.to(cD[socket.request.session.class].className).emit('reload')
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
				cD[socket.request.session.class].quizObj = quiz
				// Creates lesson based on step data
			} else if (cD[socket.request.session.class].steps[index].type == 'lesson') {
				cD[socket.request.session.class].mode = 'lesson'
				let lesson = new Lesson(cD[socket.request.session.class].steps[index].date, cD[socket.request.session.class].steps[index].lesson)
				cD[socket.request.session.class].lesson = lesson
				db.run(`INSERT INTO lessons(class, content, date) VALUES(?, ?, ?)`,
					[cD[socket.request.session.class].className, JSON.stringify(cD[socket.request.session.class].lesson), cD[socket.request.session.class].lesson.date], (err) => {
						if (err) {
							console.log(err)
						}
					})
				cD[socket.request.session.class].poll.textRes = false
				cD[socket.request.session.class].poll.prompt = cD[socket.request.session.class].steps[index].prompt
				// Check this later, there's already a quiz if statement
			} else if (cD[socket.request.session.class].steps[index].type == 'quiz') {
				questions = cD[socket.request.session.class].steps[index].questions
				quiz = new Quiz(questions.length, 100)
				quiz.questions = questions
				cD[socket.request.session.class].quizObj = quiz
				// Check this later, there's already a lesson if statement
			} else if (cD[socket.request.session.class].steps[index].type == 'lesson') {
				let lesson = new Lesson(cD[socket.request.session.class].steps[index].date, cD[socket.request.session.class].steps[index].lesson)
				cD[socket.request.session.class].lesson = lesson
				db.run(`INSERT INTO lessons(class, content, date) VALUES(?, ?, ?)`,
					[cD[socket.request.session.class].className, JSON.stringify(cD[socket.request.session.class].lesson), cD[socket.request.session.class].lesson.date], (err) => {
						if (err) {
							console.log(err)
						}
					})
			}
		} else {
			cD[socket.request.session.class].currentStep = 0
		}
	})
	// Check later, there's already a socket.on for previousPollDisplay
	socket.on('previousPollDisplay', (pollindex) => {
		db.get('SELECT data FROM poll_history WHERE id = ?', pollindex, (err, pollData) => {
			if (err) {
				console.error(err)
			} else {
				io.to(cD[socket.request.session.class].className).emit('previousPollData', JSON.parse(pollData.data))
			}
		})
	})
	// Deletes help ticket
	socket.on('deleteTicket', (student) => {
		cD[socket.request.session.class].students[student].help = ''
	})
	// Changes the class mode
	socket.on('modechange', (mode) => {
		cD[socket.request.session.class].mode = mode
		io.to(cD[socket.request.session.class].className).emit('reload')
	})

	socket.on('pluginUpdate', () => {
		pluginUpdate()
	})

	socket.on('changePlugin', (id, name, url) => {
		if (name) {
			db.run(
				'UPDATE plugins set name=? WHERE id=?',
				[name, id],
				(error) => {
					if (error) console.log(error)
					pluginUpdate()
				}
			)
		}
		else if (url) {
			db.run(
				'UPDATE plugins set url=? WHERE id=?',
				[url, id],
				(error) => {
					if (error) console.log(error)
					pluginUpdate()
				}
			)
		}
	})

	socket.on('addPlugin', (name, url) => {
		db.get(
			'SELECT * FROM classroom WHERE key = ?',
			[socket.request.session.class],
			(error, classData) => {
				if (error) console.log(error)

				db.run(
					'INSERT INTO plugins(name, url, classuid) VALUES(?, ?, ?)',
					[name, url, classData.id]
				)
				pluginUpdate()
			}
		)
	})

	socket.on('removePlugin', (id) => {
		db.run(
			'DELETE FROM plugins WHERE id=?',
			[id]
		)
		pluginUpdate()
	})
})


http.listen(420, () => {
	console.log('Running on port: 420')
})