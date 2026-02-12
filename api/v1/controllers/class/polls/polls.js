const { requireQueryParam } = require("@modules/error-wrapper");
const { getPreviousPolls } = require("@services/poll-service");
const { isAuthenticated } = require("@modules/middleware/authentication");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/polls:
     *   get:
     *     summary: Get polls in a class
     *     tags:
     *       - Class - Polls
     *     description: |
     *       Returns the poll history data for a class, including responses. Results are paginated.
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
     *       - in: query
     *         name: limit
     *         required: false
     *         schema:
     *           type: integer
     *           default: 20
     *           minimum: 1
     *         description: Maximum number of polls to return
     *       - in: query
     *         name: index
     *         required: false
     *         schema:
     *           type: integer
     *           default: 0
     *           minimum: 0
     *         description: Starting index for pagination (offset)
     *     responses:
     *       200:
     *         description: Poll data retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 data:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       id:
     *                         type: integer
     *                         description: Poll history entry ID
     *                         example: 1
     *                       class:
     *                         type: integer
     *                         description: Class ID
     *                         example: 123
     *                       data:
     *                         type: string
     *                         description: JSON string containing poll data and responses
     *                         example: '{"prompt":"What is 2+2?","answers":["3","4","5"],"responses":{}}'
     *                       date:
     *                         type: string
     *                         format: date-time
     *                         description: Timestamp when the poll was saved
     *                         example: '2026-02-10T10:30:00.000Z'
     *       400:
     *         description: Invalid parameters
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ValidationError'
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: User is not logged into the selected class or lacks permission
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       404:
     *         description: Class not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     */
    router.get("/class/:id/polls", isAuthenticated, async (req, res) => {
        const classId = req.params.id;
        requireQueryParam(classId, "classId");

        const limit = req.query.limit ? parseInt(req.query.limit) : 20;
        const index = req.query.index ? parseInt(req.query.index) : 0;
        const polls = await getPreviousPolls(classId, index, limit);

        res.status(200).json({
            success: true,
            data: polls,
        });
    });
};
