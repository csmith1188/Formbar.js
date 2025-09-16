const { logger } = require("../../../modules/logger")
const { classInformation, getClassUsers } = require("../../../modules/class/classroom")

module.exports = {
    run(router) {
        // Gets the students of a class
		router.get('/class/:id/students', async (req, res) => {
			try {
				// Get the class key from the request parameters and log the request details
				const classId = req.params.id;
				logger.log('info', `get api/class/${classId}/students ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

				// If the class does not exist, return an error
				if (!classInformation.classrooms[classId]) {
					logger.log('verbose', `[get api/class/${classId}/students] class not started`);
					res.status(404).json({ error: 'Class not started' });
					return;
				}

				// Get the user from the session
                // If the user is not in the class, return an error
				const user = req.session.user;
				if (!classInformation.classrooms[classId].students[user.email]) {
					logger.log('verbose', `[get api/class/${classId}/students] user is not logged in`);
					res.status(403).json({ error: 'User is not logged into the selected class' });
					return;
				}

				// Get the students of the class
                // If an error occurs, log the error and return the error
				const classUsers = await getClassUsers(user, classId);
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