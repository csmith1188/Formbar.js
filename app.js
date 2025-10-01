// Imported modules
const express = require('express')
const session = require('express-session') // For storing client login data
const crypto = require('crypto')
const fs = require('fs')
require('dotenv').config(); // For environment variables

if (!fs.existsSync('database/database.db')) {
    console.log('The database file does not exist. Please run "npm run init-db" to initialize the database.');
    return;
}

// Custom modules
const { logger } = require('./modules/logger.js')
const { MANAGER_PERMISSIONS, TEACHER_PERMISSIONS, GUEST_PERMISSIONS, STUDENT_PERMISSIONS, MOD_PERMISSIONS, BANNED_PERMISSIONS } = require('./modules/permissions.js')
const { classInformation } = require('./modules/class/classroom.js')
const { initSocketRoutes } = require('./sockets/init.js')
const { app, io, http, getIpAccess } = require('./modules/webServer.js')
const { settings } = require('./modules/config.js');
const { lastActivities, INACTIVITY_LIMIT } = require("./sockets/middleware/inactivity");
const { logout } = require("./modules/user/userSession");
const authentication = require('./routes/middleware/authentication.js')

// Set EJS as our view engine
app.set('view engine', 'ejs')

// Create session for user information to be transferred from page to page
const sessionMiddleware = session({
	secret: crypto.randomBytes(256).toString('hex'), // Used to sign into the session via cookies
	resave: false, // Used to prevent resaving back to the session store, even if it wasn't modified
	saveUninitialized: false // Forces a session that is new, but not modified, or 'uninitialized' to be saved to the session store
})

// Connect session middleware to express
app.use(sessionMiddleware)

// For further uses on this use this link: https://socket.io/how-to/use-with-express-session
// Uses a middleware function to successfully transmit data between the user and server
// adds session middle ware to socket.io
io.use((socket, next) => {
	sessionMiddleware(socket.request, socket.request.res || {}, next)
})

// Allows express to parse requests
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// Use a static folder for web page assets
app.use(express.static(__dirname + '/static'))
app.use('/js/chart.js', express.static(__dirname + '/node_modules/chart.js/dist/chart.umd.js'))
app.use('/js/iro.js', express.static(__dirname + '/node_modules/@jaames/iro/dist/iro.min.js'))
app.use('/js/floating-ui-core.js', express.static(__dirname + '/node_modules/@floating-ui/core/dist/floating-ui.core.umd.min.js'))
app.use('/js/floating-ui-dom.js', express.static(__dirname + '/node_modules/@floating-ui/dom/dist/floating-ui.dom.umd.min.js'))
app.use('/js/monaco-loader.js', express.static(__dirname + '/node_modules/monaco-editor/min/vs/loader.js'))
app.use('/js/vs', express.static(__dirname + '/node_modules/monaco-editor/min/vs'))

// Begin checking for any users who have not performed any actions for a specified amount of time
const INACTIVITY_CHECK_TIME = 60000 // 1 Minute
setInterval(() => {
    const currentTime = Date.now();
    for (const email of Object.keys(lastActivities)) {
        const userSockets = lastActivities[email];
        for (const [socketId, activity] of Object.entries(userSockets)) {
            if (currentTime - activity.time > INACTIVITY_LIMIT) {
                logout(activity.socket); // Log the user out
                delete lastActivities[email]; // Remove the user from the inactivity check
            }
        }
    }
}, INACTIVITY_CHECK_TIME)

// Check if an IP is banned
app.use((req, res, next) => {
	let ip = req.ip
	if (!ip) return next();
	if (ip.startsWith('::ffff:')) ip = ip.slice(7)

	const isIPBanned = authentication.checkIPBanned()
	if (isIPBanned) {
		res.render('pages/message', {
			message: 'Your IP has been banned',
			title: 'Banned'
		});
	}

	next()
})

// Add currentUser and permission constants to all pages
app.use((req, res, next) => {
    res.locals = {
        ...res.locals,
        MANAGER_PERMISSIONS,
        TEACHER_PERMISSIONS,
        MOD_PERMISSIONS,
        STUDENT_PERMISSIONS,
        GUEST_PERMISSIONS,
        BANNED_PERMISSIONS
    }

    // If the user is in a class, then get the user from the class students list
    // This ensures that the user data is always up to date
	if (req.session.classId) {
        const user = classInformation.classrooms[req.session.classId].students[req.session.email];
		if (!user) {
            res.locals.currentUser = classInformation.users[req.session.email];
            next();
            return;
        }

        classInformation.users[req.session.email] = user;
        res.locals.currentUser = user;
	} else {
        res.locals.currentUser = classInformation.users[req.session.email];
    }

	next()
})

// Import HTTP routes
const routeFiles = fs.readdirSync('./routes/').filter(file => file.endsWith('.js'));
for (const routeFile of routeFiles) {
	// Skip for now as it will be handled later
	if (routeFile == '404.js') {
		continue;
	}

	const route = require(`./routes/${routeFile}`);
	route.run(app);
}

// Initialize websocket routes
initSocketRoutes();

// Import 404 error page
require('./routes/404.js').run(app);

http.listen(settings.port, async () => {
	authentication.whitelistedIps = await getIpAccess('whitelist');
	authentication.blacklistedIps = await getIpAccess('blacklist');
	console.log(`Running on port: ${settings.port}`);
	if (!settings.emailEnabled) console.log('Email functionality is disabled.');
	if (!settings.googleOauthEnabled) console.log('Google Oauth functionality is disabled.');
	if (!settings.emailEnabled || !settings.googleOauthEnabled) console.log('To enable the disabled function(s), follow the related instructions under "Hosting Formbar.js Locally" in the Formbar wiki page at https://github.com/csmith1188/Formbar.js/wiki')
	logger.log('info', 'Start');
});