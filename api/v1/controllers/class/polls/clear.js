const { clearPoll } = require("@services/poll-service");
const { hasClassPermission } = require("@middleware/permission-check");
const { CLASS_PERMISSIONS } = require("@modules/permissions");
const { isAuthenticated } = require("@middleware/authentication");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/polls/clear:
     *   post:
     *     summary: Clear the current poll
     *     tags:
     *       - Class - Polls
     *     description: |
     *       Clears the current poll for a class.
     *
     *       **Required Permission:** Class-specific `controlPoll` permission (default: Moderator)
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
     *         description: Poll cleared successfully
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
     *         description: Insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post("/class/:id/polls/clear", isAuthenticated, hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), async (req, res) => {
        const classId = req.params.id;
        await clearPoll(classId, req.user);
        res.status(200).json({
            success: true,
            data: {},
        });
    });
};
