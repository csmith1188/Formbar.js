const { logger } = require("../../../modules/logger")
const { classInformation, getClassUsers } = require("../../../modules/class/classroom")
const { classPermCheck } = require("../../middleware/permissionCheck");
const { CLASS_PERMISSIONS } = require("../../../modules/permissions");
const { dbGetAll } = require("../../../modules/database");

module.exports = {
    run(router) {
        // Gets the students of a class
		router.get('/class/:id/students', classPermCheck(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
			try {
				// Get the class key from the request parameters and log the request details
				const classId = req.params.id;
				logger.log('info', `get api/class/${classId}/students ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

				// Get the students of the class
                // If an error occurs, log the error and return the error
				const classUsers = await dbGetAll('SELECT users.id, users.displayName, users.digipogs, classUsers.permissions AS classPermissions FROM users INNER JOIN classUsers ON users.id = classUsers.studentId WHERE classUsers.classId = ?', [classId]);
				if (classUsers.error) {
					logger.log('info', `[get api/class/${classId}] ${classUsers}`);
					res.status(404).json(classUsers);
				}

				// Send the students of the class as a JSON response
				res.status(200).json(classUsers);
			} catch (err) {
				// If an error occurs, log the error and send an error message as a JSON response
				logger.log('error', err.stack);
				res.status(500).json({ error: 'There was a server error try again.' });
			}
		})
    }
}