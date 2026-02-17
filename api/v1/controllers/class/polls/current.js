const { getCurrentPoll } = require("@services/poll-service");
const { isAuthenticated } = require("@middleware/authentication");
const { requireQueryParam } = require("@modules/error-wrapper");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/polls/current:
     *   get:
     *     summary: Get current poll in a class
     *     tags:
     *       - Class - Polls
     *     description: |
     *       Returns the current poll data for a class, including status and responses.
     *
     *       **Required Permission:** Must be a member of the class (Class-specific `seePoll` permission, default: Guest)
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
     *         description: Poll data retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Poll'
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
    router.get("/class/:id/polls/current", isAuthenticated, async (req, res) => {
        const classId = req.params.id;
        requireQueryParam(classId);

        req.infoEvent("class.poll.current.view.attempt", "Attempting to view current poll", { classId });
        const poll = await getCurrentPoll(classId, req.user);
        req.infoEvent("class.poll.current.view.success", "Current poll returned", { classId, pollStatus: poll.status });

        res.status(200).json({
            success: true,
            data: poll,
        });
    });
};
