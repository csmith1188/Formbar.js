const { logger } = require("@modules/logger");
const { httpPermCheck } = require("@modules/middleware/permissionCheck");
const { dbGet } = require("@modules/database");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { classInformation } = require("@modules/class/classroom");
const ForbiddenError = require("@errors/forbidden-error");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    // Retrieves the current class the user is in
    router.get("/user/:id/class", httpPermCheck("getActiveClass"), async (req, res) => {
        const userId = req.params.id;

        // Retrieve both users
        const apiKey = req.headers.api;
        const user = await dbGet("SELECT * FROM users WHERE API = ?", [apiKey]);
        const requestedUser = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);

        if (user.id !== requestedUser.id && user.permissionLevel < MANAGER_PERMISSIONS) {
            throw new ForbiddenError("You do not have permission to view this user's active class.");
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
                throw new NotFoundError("Class not found.");
            }
            return;
        }

        throw new NotFoundError("User is not in a class.");
    });
};
