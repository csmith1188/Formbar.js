const { httpPermCheck } = require("@modules/middleware/permission-check");
const { isClassActive } = require("@modules/class/class");
const { classInformation } = require("@modules/class/classroom");
const ForbiddenError = require("@errors/forbidden-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/active:
     *   get:
     *     summary: Check if class is active
     *     tags:
     *       - Class
     *     description: |
     *       Returns whether a class session is currently active.
     *
     *       **Required Permission:** Must be a member of the class (Class-specific `manageClass` permission for verification)
     *
     *       **Permission Levels:**
     *       - 1: Guest
     *       - 2: Student
     *       - 3: Moderator
     *       - 4: Teacher
     *       - 5: Manager
     *     security:
     *       - bearerAuth: []
     *       - sessionAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
     *     responses:
     *       200:
     *         description: Class status retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 isActive:
     *                   type: boolean
     *                   example: true
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: Unauthorized - not a member of this class
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.get("/class/:id/active", httpPermCheck("isClassActive"), async (req, res) => {
        const classId = req.params.id;
        const classroom = classInformation.classrooms[classId];
        if (classroom && !classroom.students[req.user.email]) {
            throw new ForbiddenError("You do not have permission to view the status of this class.");
        }

        const isActive = isClassActive(classId);
        res.status(200).json({ isActive });
    });
};
