const { classInformation } = require("@modules/class/classroom");
const { logger } = require("@modules/logger");
const NotFoundError = require("@errors/not-found-error");
const ForbiddenError = require("@errors/forbidden-error");
const { dbGet, dbGetAll } = require("@modules/database");
const { requireQueryParam } = require("@modules/error-wrapper");
const { getPreviousPolls } = require("@services/poll-service");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/polls:
     *   get:
     *     summary: Get polls in a class
     *     tags:
     *       - Class - Polls
     *     description: |
     *       Returns the poll data for a class, including responses.
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
    router.get("/class/:id/polls", async (req, res) => {
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
