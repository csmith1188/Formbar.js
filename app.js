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
const { initSocketRoutes, advancedEmitToClass, managerUpdate } = require("./sockets/init.js")
const { app, io, http } = require('./modules/webServer.js')

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

function getAll(query, params) {
	return new Promise((resolve, reject) => {
		database.all(query, params, (err, rows) => {
			if (err) reject(new Error(err))
			else resolve(rows)
		})
	})
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
	route.run(app);
}

// Add /api routes to express
app.use('/api', apiRoutes)

// Initialize websocket routes
initSocketRoutes();

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
