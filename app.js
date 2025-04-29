// Imported modules
const express = require('express')
const session = require('express-session') // For storing client login data
const crypto = require('crypto')
const fs = require('fs')
require('dotenv').config(); // For environment variables

// Custom modules
const { logger } = require('./modules/logger.js')
const { MANAGER_PERMISSIONS, TEACHER_PERMISSIONS, GUEST_PERMISSIONS, STUDENT_PERMISSIONS, MOD_PERMISSIONS, BANNED_PERMISSIONS } = require('./modules/permissions.js')
const { classInformation } = require('./modules/class.js')
const { initSocketRoutes } = require('./sockets/init.js')
const { app, io, http, getIpAccess } = require('./modules/webServer.js')
const { upgradeDatabase } = require('./data_upgrader/dataUpgrader.js')
const authentication = require('./modules/authentication.js')
const { settings } = require('./modules/config.js');
const { configPlugins, plugins } = require('./modules/plugins.js')
const { dir } = require('console');
const { config } = require('dotenv');

// Upgrade the database if it's not up to date
upgradeDatabase();

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

// Use a static folder for web page assets
app.use(express.static(__dirname + '/static'))
app.use('/js/chart.js', express.static(__dirname + '/node_modules/chart.js/dist/chart.umd.js'))
app.use('/js/iro.js', express.static(__dirname + '/node_modules/@jaames/iro/dist/iro.min.js'))
app.use('/js/floating-ui-core.js', express.static(__dirname + '/node_modules/@floating-ui/core/dist/floating-ui.core.umd.min.js'))
app.use('/js/floating-ui-dom.js', express.static(__dirname + '/node_modules/@floating-ui/dom/dist/floating-ui.dom.umd.min.js'))
app.use('/js/monaco-loader.js', express.static(__dirname + '/node_modules/monaco-editor/min/vs/loader.js'))
app.use('/js/vs', express.static(__dirname + '/node_modules/monaco-editor/min/vs'))

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
// Additionally, handle session expiration
app.use((req, res, next) => {
	if (req.session.classId || req.session.classId === null) {
		res.locals.currentUser = classInformation.users[req.session.username];
	}

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

// Initialize plugins
configPlugins(app);

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