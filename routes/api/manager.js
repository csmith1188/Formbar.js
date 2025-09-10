const { logger } = require("../../modules/logger")
const { MANAGER_PERMISSIONS } = require("../../modules/permissions");
const { getManagerData } = require("../../modules/manager");

module.exports = {
    run(router) {
        // Retrieves manager data
        router.get('/manager', async (req, res) => {
            try {
                // Grab the user from the session
                const user = req.session.user;
                logger.log('info', `[get api/manager] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                logger.log('verbose', `[get api/manager] response=(${JSON.stringify(user)})`);

                // If the user does not have manager permissions, return a 403 error
                if (user.permissions < MANAGER_PERMISSIONS) {
                    return res.status(403).json({ error: 'You do not have permission to access this resource.' });
                }
                const { users, classrooms } = await getManagerData();

                // Send the manager data as a JSON response
                res.status(200).json({
                    users,
                    classrooms
                });
            } catch (err) {
                // If an error occurs, log the error and send an error message as a JSON response
                logger.log('error', err.stack);
                res.status(500).json({ error: 'There was a server error try again.' });
            }
        })
    }
}