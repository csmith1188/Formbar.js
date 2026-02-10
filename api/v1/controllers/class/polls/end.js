const { hasClassPermission } = require("@middleware/permission-check");
const { isAuthenticated } = require("@middleware/authentication");
const { parseJson } = require("@middleware/parse-json");
const { CLASS_PERMISSIONS } = require("@modules/permissions");
const { updatePoll } = require("@services/poll-service");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/polls/end:
     *   post:
     *     summary: End the current poll
     *     tags:
     *       - Class - Polls
     *     description: |
     *       Ends the current poll for a class.
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
     *         description: Poll ended successfully
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
    router.post("/class/:id/polls/end", isAuthenticated, hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), parseJson, async (req, res) => {
        const classId = req.params.id;
        await updatePoll(classId, { status: false }, req.user);
        res.status(200).json({
            success: true,
            data: {},
        });
    });
};
