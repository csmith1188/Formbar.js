const { httpPermCheck } = require("@middleware/permission-check");
const { leaveClass } = require("@services/class-service");
const ForbiddenError = require("@errors/forbidden-error");
const ValidationError = require("@errors/validation-error");
const { isAuthenticated } = require("@middleware/authentication");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/leave:
     *   post:
     *     summary: Leave a class session
     *     tags:
     *       - Class
     *     description: |
     *       Leaves the current class session. The user is still attached to the classroom.
     *
     *       **Required Permission:** Global Guest permission (level 1)
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
     *         description: Successfully left the class session
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       400:
     *         description: Class ID is required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: Unauthorized
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post("/class/:id/leave", isAuthenticated, httpPermCheck("leaveClass"), async (req, res) => {
        const classId = req.params.id;
        req.infoEvent("class.leave.attempt", "Attempting to leave class", { classId });

        // Validate that classId is provided
        if (!classId) {
            throw new ValidationError("Class ID is required.");
        }

        const result = leaveClass(req.user, Number(req.params.id));
        if (!result) {
            throw new ForbiddenError("Unauthorized");
        }

        req.infoEvent("class.leave.success", "Class left successfully", { classId });
        res.status(200).json({
            success: true,
            data: {},
        });
    });
};
