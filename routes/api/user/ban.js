const { logger } = require("../../../modules/logger");
const { hasPermission } = require("../../middleware/permissionCheck");
const { dbGet } = require("../../../modules/database");
const { MANAGER_PERMISSIONS } = require("../../../modules/permissions");
const { classInformation } = require("../../../modules/class/classroom");

module.exports = {
    run(router) {
        // Retrieves the current class the user is in
        router.get('/user/:id/ban', hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
            try {
                const userId = req.params.id;
                const user = await dbGet(`SELECT * FROM users WHERE id = ?`, [userId]);
                if (!user) {
                    return res.status(404).json({ error: 'User not found' });
                }

                const userInformation = classInformation.users[user.email]
                if (userInformation && userInformation.banned) {
                    return res.status(200).json({ banned: true, reason: userInformation.banReason || "No reason provided" });
                }
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}