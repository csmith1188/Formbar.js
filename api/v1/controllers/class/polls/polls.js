const { requireQueryParam } = require("@modules/error-wrapper");
const { getPreviousPolls } = require("@services/poll-service");
const { isAuthenticated } = require("@middleware/authentication");
const ValidationError = require("@errors/validation-error");

const DEFAULT_POLL_LIMIT = 20;
const MAX_POLL_LIMIT = 100;

function parseIntegerQueryParam(value, defaultValue) {
    if (value == null) {
        return defaultValue;
    }

    const normalized = String(value).trim();
    if (!/^-?\d+$/.test(normalized)) {
        return NaN;
    }

    return Number.parseInt(normalized, 10);
}

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
     *           maximum: 100
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

        // Ensure the authenticated user is logged into / associated with this class.
        const userClassId = req.user && req.user.classId;
        if (!userClassId || String(userClassId) !== String(classId)) {
            return res.status(403).json({
                success: false,
                error: "User is not logged into the selected class or lacks permission",
            });
        }

        req.infoEvent("class.polls.view", "Viewing class polls", { classId });

        const limit = parseIntegerQueryParam(req.query.limit, DEFAULT_POLL_LIMIT);
        const index = parseIntegerQueryParam(req.query.index, 0);

        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_POLL_LIMIT) {
            throw new ValidationError(`Invalid limit. Expected an integer between 1 and ${MAX_POLL_LIMIT}.`);
        }

        if (!Number.isInteger(index) || index < 0) {
            throw new ValidationError("Invalid index. Expected a non-negative integer.");
        }

        const polls = await getPreviousPolls(classId, index, limit);

        req.infoEvent("class.polls.data_sent", "Poll data sent to client", { classId, pollCount: polls.length, limit, index });

        res.status(200).json({
            success: true,
            data: polls,
        });
    });
};
