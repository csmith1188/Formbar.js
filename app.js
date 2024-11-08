// Imported modules
const express = require('express')
const session = require('express-session') // For storing client login data
const crypto = require('crypto')
const fs = require("fs")
const { isAuthenticated, isLoggedIn, permCheck } = require('./modules/authentication.js')
const { logger } = require('./modules/logger.js')
const { logNumbers, settings } = require('./modules/config.js')
const { MANAGER_PERMISSIONS, TEACHER_PERMISSIONS, GUEST_PERMISSIONS, STUDENT_PERMISSIONS, MOD_PERMISSIONS, BANNED_PERMISSIONS, DEFAULT_CLASS_PERMISSIONS, CLASS_SOCKET_PERMISSIONS, CLASS_SOCKET_PERMISSION_SETTINGS, GLOBAL_SOCKET_PERMISSIONS } = require('./modules/permissions.js')
const { classInformation, Classroom } = require('./modules/class.js')
const { database } = require('./modules/database.js')
const { initSocketRoutes, advancedEmitToClass, managerUpdate, io } = require("./sockets/init.js")

const app = express()
const http = require('http').createServer(app)

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

// Import HTTP routes
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
				const user = classInformation.noClass.students[req.session.username]

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

// Initialize websocket routes
initSocketRoutes(io);

http.listen(420, async () => {
	whitelistedIps = await getIpAccess('whitelist')
	blacklistedIps = await getIpAccess('blacklist')
	console.log('Running on port: 420')
	logger.log('info', 'Start')
})
