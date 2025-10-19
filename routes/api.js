const express = require('express')
const fs = require('fs')
const router = express.Router()
const { logger } = require('../modules/logger');
const { GUEST_PERMISSIONS } = require('../modules/permissions');
const { getUser } = require('../modules/user/user');

module.exports = {
	run(app) {
		try {
			// Checks to see if the user is authenticated
			router.use(async (req, res, next) => {
				try {
					// Log the IP and session of the request
					logger.log('info', `[isAuthenticated] ip=(${req.ip}) session=(${JSON.stringify(res.session)})`)

					// If no API key provided, allow if a session user already exists or it's a digipogs endpoint
					if (!req.headers.api) {
						if (req.session && req.session.user) {
							return next();
						}
						if (req.path && req.path.startsWith('/digipogs/')) {
							return next();
						}
					}

					// Get the current user from API key if provided
					let user = await getUser(req.headers.api)

					// If the user is an instance of Error
					if (user instanceof Error) {
						// Respond with a server error message
						res.status(500).json({ error: 'There was a server error try again.' })
						
						// Throw the error
						throw user
					}

					// If the user has an error property
					if (user.error) {
						// Log the error
						logger.log('info', user)

						// Respond with the error
						res.status(401).json({ error: user.error })
						return
					}
	
					// If the user exists
					// Set the user in the session
					if (user) {
						req.session.user = user
                        req.session.email = user.email
					}
	
					// Log the authenticated user
					logger.log('info', `[isAuthenticated] user=(${JSON.stringify(req.session.user)})`)
	
					// Call the next middleware function
					next()
				} catch (err) {
					// Log any errors
					logger.log('error', err.stack)
				}
			})
	
			// Middleware function to check API permissions.
			router.use((req, res, next) => {
				// Extract user details from the session
				// Allow digipogs endpoints without API/session permission checks
				if (req.url && req.url.startsWith('/digipogs/')) {
					return next();
				}

				const permissions = req.session.user.permissions
				const classPermissions = req.session.user.classPermissions
				let urlPath = req.url
	
				// Log the request details
				logger.log('info', `[apiPermCheck] ip=(${req.ip}) session=(${JSON.stringify(req.session)}) url=(${req.url})`)
	
				// If no URL is provided, return
				if (!urlPath) return
	
				// Checks if url has a / in it and removes it from the string
				if (urlPath.indexOf('/') != -1) {
					urlPath = urlPath.slice(urlPath.indexOf('/') + 1)
				}
	
				// Check for ?(urlParams) and removes it from the string
				if (urlPath.indexOf('?') != -1) {
					urlPath = urlPath.slice(0, urlPath.indexOf('?'))
				}
	
				// If the URL starts with 'class/', extract the class code
				if (urlPath.startsWith('class/')) {
					classCode = urlPath.split('/')[1]
				}
	
				// If the URL is 'me', proceed to the next middleware
				if (urlPath == 'me') {
					next()
					return
				}

				// If the user does not have sufficient permissions, return an error
				if (permissions <= GUEST_PERMISSIONS || (classPermissions && classPermissions <= GUEST_PERMISSIONS)) {
					res.status(403).json({ error: 'You do not have permission to access this page.' })
					return
				}
	
				// If all checks pass, proceed to the next middleware
				next()
			})
	
			// Check for multiple of the same query parameter
			router.use((req, res, next) => {
				let query = req.query
	
				for (let key in query) {
					if (Array.isArray(query[key])) {
						res.status(400).json({ error: `You can only have one ${key} parameter` })
						return
					}
				}
	
				next()
			})
	
			// Import API routes recursively
			const loadRoutes = (directory) => {
				const files = fs.readdirSync(`./routes/${directory}`);
				files.forEach(file => {
					const fullPath = `${directory}/${file}`;
					if (fs.statSync(`./routes/${fullPath}`).isDirectory()) {
						loadRoutes(fullPath);
					} else if (file.endsWith('.js')) {
						const route = require(fullPath);
						route.run(router);
					}
				});
			};

			loadRoutes("./api");
			app.use("/api", router)

			// Ensure API returns JSON for unknown endpoints
			router.use((req, res) => {
				res.status(404).json({ error: 'API not found.' })
			})
		} catch (err) {
			logger.log('error', err.stack)
		}
	}
}
