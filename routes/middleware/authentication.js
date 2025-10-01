const { logger } = require("../../modules/logger")
const { classInformation } = require("../../modules/class/classroom")
const { logNumbers, settings } = require("../../modules/config")
const { TEACHER_PERMISSIONS, PAGE_PERMISSIONS, GUEST_PERMISSIONS } = require("../../modules/permissions")

const whitelistedIps = {}
const blacklistedIps = {}
const loginOnlyRoutes = [
	'/createClass',
	'/selectClass',
	'/manageClass',
	'/managerPanel',
	'/downloadDatabase',
	'/logs',
	'/apikey',
] // Routes that can be accessed without being in a class

/*
Check if user has logged in
Place at the start of any page that needs to verify if a user is logged in or not
This allows websites to check on their own if the user is logged in
This also allows for the website to check for permissions
*/
function isAuthenticated(req, res, next) {
	try {
		logger.log('info', `[isAuthenticated] url=(${req.url}) ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

		// Check if the user is logged in, if not redirect to login page
        const user = classInformation.users[req.session.email];
		if (!req.session.email || !user) {
			return res.redirect('/login');
		}

		// If the user is already logged in and tries to access the login page, redirect them to the home page
		if (req.url === '/login') {
			res.redirect('/');
			return;
		}

		// If the user is already in a class and tries to access the select class page, redirect them to the appropriate page
		const isTeacher = user.permissions >= TEACHER_PERMISSIONS
		const isInClass = user.activeClass != null;
		if (req.url === '/selectClass' && isInClass) {
			isTeacher ? res.redirect('/controlPanel') : res.redirect('/student');
			return;
		}

		// Allow access to certain routes without being in a class
		if (loginOnlyRoutes.includes(req.url)) {
			next();
			return;
		}

		// If the user is not in a class, then continue
		if (isInClass) {
			next()
			return;
		}

		// If the user is not in a class, redirect them to the select class page
		if (isTeacher) {
			next();
			return;
		} else if (req.url !== '/selectClass') {
			res.redirect('/selectClass');
			return;
		}

		next();
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		})
	}
}

// Create a function to check if the user's email is verified
function isVerified(req, res, next) {
	try {
		// Log that the function is being called with the ip and the session of the user
		logger.log('info', `[isVerified] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
		if (req.session.email) {
			// If the user is verified or email functionality is disabled...
			if (req.session.verified || !settings.emailEnabled || classInformation.users[req.session.email].permissions == GUEST_PERMISSIONS) {
				next();
			} else {
				// Redirect to the login page
				res.redirect('/login');
			};
		} else {
			// If there is no session, redirect to the login page
			res.redirect('/login');
		}
	} catch (err) {
		logger.log('error', err.stack);
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		});
	}
}

// Check if user has the permission levels to enter that page
function permCheck(req, res, next) {
	try {
		const email = req.session.email

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

			// Check for a second / in the url and remove it from the string
			if (urlPath.indexOf('/') != -1) {
				urlPath = urlPath.slice(0, urlPath.indexOf('/'))
			}

			if (!classInformation.users[email]) {
				req.session.classId = null
			}

			// Ensure the url path is all lowercase
			urlPath = urlPath.toLowerCase();

			logger.log('verbose', `[permCheck] urlPath=(${urlPath})`)
			if (!PAGE_PERMISSIONS[urlPath]) {
				logger.log('info', `[permCheck] ${urlPath} is not in the page permissions`)
				res.render('pages/message', {
					message: `Error: ${urlPath} is not in the page permissions`,
					title: 'Error'
				})
			}

			// Checks if users permissions are high enough
			if (PAGE_PERMISSIONS[urlPath].classPage && classInformation.users[email].classPermissions >= PAGE_PERMISSIONS[urlPath].permissions) {
				next()
			} else if (!PAGE_PERMISSIONS[urlPath].classPage && classInformation.users[email].permissions >= PAGE_PERMISSIONS[urlPath].permissions) {
				next()
			} else {
				logger.log('info', '[permCheck] Not enough permissions')
				res.redirect('/')
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

function checkIPBanned() {
	if (settings.whitelistActive && Object.keys(whitelistedIps).length > 0) {
		const isWhitelisted = Object.values(whitelistedIps).some(value => ip.startsWith(value.ip))
		if (!isWhitelisted) {
			return true;
		}
	}
	
	if (settings.blacklistActive && Object.keys(blacklistedIps).length > 0) {
		const isBlacklisted = Object.values(blacklistedIps).some(value => ip.startsWith(value.ip))
		if (isBlacklisted) {
			return true;
		}
	}
	
	return false;
}

module.exports = {
	// Whitelisted/Blacklisted IP addresses
	whitelistedIps,
	blacklistedIps,
	
	// Authentication functions
    isAuthenticated,
	isVerified,
    permCheck,
	checkIPBanned
}