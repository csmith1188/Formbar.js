const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { logger } = require("@modules/logger");
const { getManagerData } = require("@modules/manager");
const { hasPermission } = require("@modules/middleware/permissionCheck");

module.exports = (router) => {
    // Retrieves manager data
    router.get("/manager", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        // Grab the user from the session
        const user = req.session.user;

        // Grab manager data and send it back as a JSON response
        const { users, classrooms } = await getManagerData();
        res.status(200).json({
            users,
            classrooms,
        });
    });
};
