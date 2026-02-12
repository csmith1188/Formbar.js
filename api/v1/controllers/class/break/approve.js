const { httpPermCheck } = require("@middleware/permission-check");
const { classInformation } = require("@modules/class/classroom");
const { approveBreak } = require("@modules/class/break");
const { isAuthenticated } = require("@middleware/authentication");
const ForbiddenError = require("@errors/forbidden-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    const approveBreakHandler = async (req, res) => {
        const classId = req.params.id;
        const targetUserId = req.params.userId;
        req.infoEvent("class.break.approve.attempt", "Attempting to approve class break", { classId, targetUserId });
        const classroom = classInformation.classrooms[classId];
        if (classroom && !classroom.students[req.user.email]) {
            throw new ForbiddenError("You do not have permission to approve this user's break.");
        }

        const userData = { ...req.user, classId };
        const result = await approveBreak(true, targetUserId, userData);
        if (result === true) {
            req.infoEvent("class.break.approve.success", "Class break approved", { classId, targetUserId });
            res.status(200).json({
                success: true,
                data: {},
            });
        } else {
            throw new AppError(result, 500);
        }
    };

    /**
     * @swagger
     * /api/v1/class/{id}/students/{userId}/break/approve:
     *   post:
     *     summary: Approve a student's break request
     *     tags:
     *       - Class - Breaks
     *     description: |
     *       Approves a break request for a student in a class.
     *
     *       **Required Permission:** Class-specific `breakHelp` permission (default: Moderator)
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
     *       - in: path
     *         name: userId
     *         required: true
     *         schema:
     *           type: string
     *         description: Student user ID
     *     responses:
     *       200:
     *         description: Break request approved successfully
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
     *         description: Not authorized to approve breaks in this class
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
    router.post("/class/:id/students/:userId/break/approve", isAuthenticated, httpPermCheck("approveBreak"), approveBreakHandler);

    // Deprecated endpoint - kept for backwards compatibility, use POST /api/v1/class/:id/students/:userId/break/approve instead
    router.get("/class/:id/students/:userId/break/approve", isAuthenticated, httpPermCheck("approveBreak"), async (req, res) => {
        res.setHeader("X-Deprecated", "Use POST /api/v1/class/:id/students/:userId/break/approve instead");
        res.setHeader(
            "Warning",
            '299 - "Deprecated API: Use POST /api/v1/class/:id/students/:userId/break/approve instead. This endpoint will be removed in a future version."'
        );
        await approveBreakHandler(req, res);
    });
};
