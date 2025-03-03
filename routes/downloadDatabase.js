const { isLoggedIn, permCheck } = require("../modules/authentication");
const { logger } = require("../modules/logger");
const { MANAGER_PERMISSIONS } = require("../modules/permissions");

module.exports = {
    run(app) {
        app.post('/downloadDatabase', isLoggedIn, permCheck, (req, res) => {
			try {
				// Log the request details
				logger.log('info', `[get api/downloadDatabase] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

				// Get the user from the session
				const user = req.session.user;
                if (user.permissions != MANAGER_PERMISSIONS) {
                    res.status(403).json({ error: 'You do not have permission to perform this action.' });
                    return;
                }

                res.download('database/database.db', 'database.db');
				res.send("abc");
			} catch (err) {
				// If an error occurs, log the error and send an error message as a JSON response
				logger.log('error', err.stack);
				res.status(500).json({ error: 'There was a server error try again.' });
			}
		})
    }
}