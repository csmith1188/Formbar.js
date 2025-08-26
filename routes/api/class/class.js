const { classInformation, getClassUsers } = require("../../../modules/class/classroom")
const { getPollResponses } = require("../../../modules/polls")
const { TEACHER_PERMISSIONS } = require("../../../modules/permissions")
const { logger } = require("../../../modules/logger")

module.exports = {
    run(router) {
        // Gets a class by id
		router.get('/class/:id', async (req, res) => {
			try {
				let classId = req.params.id;

				// Log the request details
				logger.log('info', `[get api/class/${classId}] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

				// Get a clone of the class data
                // If the class does not exist, return an error
                const classData = structuredClone(classInformation.classrooms[classId]);
				if (!classData) {
					res.status(404).json({ error: 'Class not started' });
					return;
				}

				// Get the poll responses in the class
				classData.poll.responses = getPollResponses(classData);

				// Get the user from the session, and if the user is not in the class, return an error
				const user = req.session.user;
				if (!classData.students[user.email]) {
					logger.log('verbose', `[get api/class/${key}] user is not logged in`);
					res.status(403).json({ error: 'User is not logged into the selected class' });
					return;
				}

				// Get the users in the class
				const classUsers = await getClassUsers(user, classData.key);

				// If an error occurs, log the error and return the error
				if (classUsers.error) {
					logger.log('info', `[get api/class/${key}] ${classUsers}`);
					res.status(404).json(classUsers);
					return;
				}

				// If the user is not a teacher or manager, remove the sensitive data from the class data
				if (user.classPermissions < TEACHER_PERMISSIONS) {
					delete classData.pollHistory;
                    delete classData.key;
                    delete classData.sharedPolls;

                    classData.students = { [req.session.email]: classUsers[req.session.email] };
				} else {
                    classData.students = classUsers;
                }

				// Log the class data and send the response
				logger.log('verbose', `[get api/class/${classId}] response=(${JSON.stringify(classData)})`);
				res.status(200).json(classData);
			} catch (err) {
				// If an error occurs, log the error and send an error message as a JSON response
				logger.log('error', err.stack);
				res.status(500).json({ error: 'There was a server error try again.' });
			}
		})
    }
}