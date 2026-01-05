const { logger } = require("@modules/logger");
const { httpPermCheck } = require("../middleware/permissionCheck");
const { dbGet } = require("@modules/database");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { classInformation } = require("@modules/class/classroom");

module.exports = (router) => {
    try {
        // Retrieves the current class the user is in
        router.get("/user/:id/class", httpPermCheck("getActiveClass"), async (req, res) => {
            try {
                const userId = req.params.id;

                // Retrieve both users
                const apiKey = req.headers.api;
                const user = await dbGet("SELECT * FROM users WHERE API = ?", [apiKey]);
                const requestedUser = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);

                if (user.id !== requestedUser.id && user.permissionLevel < MANAGER_PERMISSIONS) {
                    req.status(403).json({ error: "You do not have permission to view this user's active class." });
                    return;
                }

                const userInformation = classInformation.users[user.email];
                if (userInformation && userInformation.activeClass) {
                    const classId = userInformation.activeClass;
                    const classInfo = await dbGet("SELECT * FROM classroom WHERE id = ?", [classId]);
                    if (classInfo) {
                        res.status(200).json({
                            id: classId,
                            name: classInfo.name,
                        });
                    } else {
                        res.status(404).json({ error: "Class not found." });
                    }
                    return;
                }

                res.status(404).json({ error: "User is not in a class." });
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
