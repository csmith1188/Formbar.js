const { httpPermCheck } = require("@middleware/permission-check");
const { classInformation } = require("@modules/class/classroom");
const { endBreak } = require("@modules/class/break");
const { isAuthenticated } = require("@middleware/authentication");
const ForbiddenError = require("@errors/forbidden-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/break/end:
     *   post:
     *     summary: End your own break
     *     tags:
     *       - Class - Breaks
     *     description: |
     *       Ends the current user's break in a class.
     *
     *       **Required Permission:** Class-specific Student permission (level 2)
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
     *         description: Break ended successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: Not authorized to end breaks in this class
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.post("/class/:id/break/end", isAuthenticated, httpPermCheck("endBreak"), async (req, res) => {
        const classId = req.params.id;
        req.infoEvent("class.break.end.attempt", "Attempting to end class break", { classId });
        const classroom = classInformation.classrooms[classId];
        if (classroom && !classroom.students[req.user.email]) {
            throw new ForbiddenError("You do not have permission to end this user's break.");
        }

        const userData = { ...req.user, classId };
        const result = endBreak(userData);
        if (result === true) {
            req.infoEvent("class.break.end.success", "Class break ended", { classId });
            res.status(200).json({
                success: true,
                data: {},
            });
        } else {
            throw new AppError(result, 500);
        }
    });
};
