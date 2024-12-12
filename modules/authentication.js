const { logger } = require("./logger")
const { classInformation } = require("./class")
const { logNumbers, settings } = require("./config")
const { MANAGER_PERMISSIONS, TEACHER_PERMISSIONS, PAGE_PERMISSIONS } = require("./permissions")

const whitelistedIps = {}
const blacklistedIps = {}

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
			if (classInformation.noClass.students[req.session.username]) {
				if (classInformation.noClass.students[req.session.username].permissions >= MANAGER_PERMISSIONS) {
					res.redirect('/managerPanel')
				} else if (classInformation.noClass.students[req.session.username].classPermissions >= TEACHER_PERMISSIONS) {
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

// Create a function to check if the user's email is verified
let isVerified = (req, res, next) => {
	// Try...
	try {
		// Log that the function is being called with the ip and the session of the user
		logger.log('info', `[isVerified] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
		// If the user is verified...
		if (req.session.verified) {
			// Continue
			next()
		// Else...
		} else {
			// Redirect to the verification page
			res.redirect('/verification')
		};
	// Catch any errors that may arise
	} catch (err) {
		// Log the error through the logger
		logger.log('error', err.stack);
		// Render the message page with the error message
		res.render('pages/message', {
			message: `Error Number ${logNumbers.error}: There was a server error try again.`,
			title: 'Error'
		});
	};
};

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

			if (!classInformation[classCode].students[username]) {
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
				classInformation[classCode].students[username].classPermissions >= PAGE_PERMISSIONS[urlPath].permissions
			) {
				next()
			} else if (
				!PAGE_PERMISSIONS[urlPath].classPage &&
				classInformation[classCode].students[username].permissions >= PAGE_PERMISSIONS[urlPath].permissions
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
    isLoggedIn,
    permCheck,
	checkIPBanned
}