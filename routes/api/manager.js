const { logger } = require("../../modules/logger");
const { MANAGER_PERMISSIONS } = require("../../modules/permissions");
const { getManagerData } = require("../../modules/manager");
const { hasPermission } = require("../middleware/permissionCheck");

module.exports = {
    run(router) {
        // Retrieves manager data
        router.get("/manager", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
            try {
                // Grab the user from the session
                const user = req.session.user;
                logger.log("info", `[get api/manager] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                logger.log("verbose", `[get api/manager] response=(${JSON.stringify(user)})`);

                // Grab manager data and send it back as a JSON responses
                const { users, classrooms } = await getManagerData();
                res.status(200).json({
                    users,
                    classrooms,
                });
            } catch (err) {
                // If an error occurs, log the error and send an error message as a JSON response
                logger.log("error", err.stack);
                res.status(500).json({ error: "There was a server error try again." });
            }
        });
    },
};
