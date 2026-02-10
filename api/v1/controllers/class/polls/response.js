const { pollResponse } = require("@services/poll-service");
const { httpPermCheck } = require("@middleware/permission-check");
const { parseJson } = require("@middleware/parse-json");
const { isAuthenticated } = require("@middleware/authentication");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/polls/response:
     *   post:
     *     summary: Submit a poll response
     *     tags:
     *       - Class - Polls
     *     description: |
     *       Submits a response to the current poll running in a class.
     *
     *       **Required Permission:** Class-specific `votePoll` permission (default: Student)
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
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               response:
     *                 type: array
     *                 items:
     *                   type: string
     *                 example: ["4"]
     *               textRes:
     *                 type: string
     *                 example: "My answer"
     *     responses:
     *       200:
     *         description: Poll response submitted successfully
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
     *         description: Unauthorized to respond to this poll
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post("/class/:id/polls/response", isAuthenticated, httpPermCheck("pollResp"), parseJson, async (req, res) => {
        const { response, textRes } = req.body;
        const classId = req.params.id;
        await pollResponse(classId, response, textRes, req.user);
        res.status(200).json({
            success: true,
            data: {},
        });
    });
};
