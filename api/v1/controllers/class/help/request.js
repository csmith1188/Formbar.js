const { httpPermCheck } = require("@modules/middleware/permission-check");
const { classInformation } = require("@modules/class/classroom");
const { sendHelpTicket } = require("@modules/class/help");
const { isAuthenticated } = require("@modules/middleware/authentication");
const ForbiddenError = require("@errors/forbidden-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    const requestHelpHandler = async (req, res) => {
        const classId = req.params.id;
        const classroom = classInformation.classrooms[classId];
        if (classroom && !classroom.students[req.user.email]) {
            throw new ForbiddenError("You do not have permission to request help in this class.");
        }

        const reason = req.body.reason || "General help request";
        const userData = { ...req.user, classId };
        const result = await sendHelpTicket(reason, userData);
        if (result === true) {
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
     * /api/v1/class/{id}/help/request:
     *   post:
     *     summary: Request help in a class
     *     tags:
     *       - Class - Help
     *     description: |
     *       Submits a help request in a class session.
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
     *         description: Help request submitted successfully
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
     *         description: Not authorized to request help in this class
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
    router.post("/class/:id/help/request", isAuthenticated, httpPermCheck("help"), requestHelpHandler);

    // Deprecated endpoint - kept for backwards compatibility, use POST /api/v1/class/:id/help/request instead
    router.get("/class/:id/help/request", isAuthenticated, httpPermCheck("help"), async (req, res) => {
        res.setHeader("X-Deprecated", "Use POST /api/v1/class/:id/help/request instead");
        res.setHeader(
            "Warning",
            '299 - "Deprecated API: Use POST /api/v1/class/:id/help/request instead. This endpoint will be removed in a future version."'
        );
        await requestHelpHandler(req, res);
    });
};
