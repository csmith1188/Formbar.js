const { classInformation } = require("@modules/class/classroom");
const { logger } = require("@modules/logger");
const NotFoundError = require("@errors/not-found-error");
const ForbiddenError = require("@errors/forbidden-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/permissions:
     *   get:
     *     summary: Get class permissions
     *     tags:
     *       - Class
     *     description: |
     *       Returns the permissions configuration for a class.
     *
     *       **Required Permission:** Must be a member of the class (any permission level)
     *
     *       **Permission Levels:**
     *       - 1: Guest
     *       - 2: Student
     *       - 3: Moderator
     *       - 4: Teacher
     *       - 5: Manager
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
     *     responses:
     *       200:
     *         description: Permissions retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ClassPermission'
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: User is not logged into the selected class
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       404:
     *         description: Class not started
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     */
    router.get("/class/:id/permissions", async (req, res) => {
        // Get the class key from the request parameters and log the request details
        let classId = req.params.id;
        req.infoEvent("class.permissions.view", `Viewing class permissions`, { user: req.user?.email, ip: req.ip, classId });

        // Get a clone of the class data
        // If the class does not exist, return an error
        let classData = structuredClone(classInformation.classrooms[classId]);
        if (!classData) {
            throw new NotFoundError("Class not started");
        }

        // Get the user from the session
        // If the user is not in the class, return an error
        const user = req.user;
        if (!classData.students[user.email]) {
            req.infoEvent("class.permissions.not_in_class", `User not logged into class`, { user: user.email, classId });
            throw new ForbiddenError("User is not logged into the selected class");
        }

        // Send the class permissions as a JSON response
        res.status(200).json({
            success: true,
            data: classData.permissions,
        });
    });
};
