const { httpPermCheck } = require("@modules/middleware/permission-check");
const { dbGet } = require("@modules/database");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { classInformation } = require("@modules/class/classroom");
const { isAuthenticated } = require("@modules/middleware/authentication");
const ForbiddenError = require("@errors/forbidden-error");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/user/{id}/class:
     *   get:
     *     summary: Get user's active class
     *     tags:
     *       - Users
     *     description: Retrieves the current class the user is in
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: User ID
     *     responses:
     *       200:
     *         description: Active class retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 id:
     *                   type: string
     *                   example: "abc123"
     *                 name:
     *                   type: string
     *                   example: "Math 101"
     *       403:
     *         description: Not authorized to view this user's active class
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       404:
     *         description: User is not in a class or class not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     */
    router.get("/user/:id/class", isAuthenticated, httpPermCheck("getActiveClass"), async (req, res) => {
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
