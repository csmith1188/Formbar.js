const { logNumbers } = require("../modules/config")
const { logger } = require("../modules/logger")

// This is the page shown when a user tries to access a page that does not exist
module.exports = {
	run(app) {
		app.use((req, res, next) => {
			try {
				let urlPath = req.url // Defines users desired endpoint
				
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
	}
}