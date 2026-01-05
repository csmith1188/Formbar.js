const { logger } = require("@modules/logger");
const { deleteUser } = require("@modules/user/userSession");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("../middleware/permissionCheck");

module.exports = (router) => {
    try {
        // Deletes a user from Formbar
        router.get("/user/:id/delete", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
            try {
                const userId = req.params.id;
                const result = await deleteUser(userId);
                if (result === true) {
                    res.status(200);
                } else {
                    res.status(500).json({ error: result });
                }
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
