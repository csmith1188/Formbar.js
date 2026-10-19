const { saveUserPollTemplate, getUserPollTemplates } = require("@services/poll-service");
const { isSelfOrHasScopes } = require("@middleware/permission-check");
const { parseJson } = require("@middleware/parse-json");
const { SCOPES } = require("@modules/permissions");
const { isAuthenticated } = require("@middleware/authentication");

/**
 * Register user poll template controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/user/{id}/polls/templates:
     *   get:
     *     summary: Get saved poll templates in My Polls
     *     tags:
     *       - Users
     *     description: |
     *       Returns poll templates owned by, shared with, or marked public for the given user.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: User ID
     *     responses:
     *       200:
     *         description: Poll templates retrieved
     *       401:
     *         description: Unauthenticated
     *       403:
     *         description: Insufficient permissions
     */
    router.get(
        "/user/:id/polls/templates",
        isAuthenticated,
        isSelfOrHasScopes(SCOPES.GLOBAL.USERS.MANAGE, "Not authorized to view this user's polls."),
        async (req, res) => {
            const userId = req.params.id;

            req.infoEvent("poll.template.list.attempt", "Attempting to list user poll templates", { targetUserId: userId });

            const polls = await getUserPollTemplates(userId);

            req.infoEvent("poll.template.list.success", "User poll templates returned", {
                targetUserId: userId,
                pollCount: polls.length,
            });

            res.status(200).json({
                success: true,
                data: { polls },
            });
        }
    );

    /**
     * @swagger
     * /api/v1/user/{id}/polls/templates:
     *   post:
     *     summary: Save a poll template to My Polls
     *     tags:
     *       - Users
     *     description: |
     *       Saves the poll editor configuration as a reusable custom poll owned by the user.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: User ID
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - name
     *               - prompt
     *               - promptMD
     *               - promptHTML
     *               - answers
     *             properties:
     *               name:
     *                 type: string
     *                 example: "Unit 3 Review"
     *               prompt:
     *                 type: string
     *                 example: "Which answer is correct?"
     *               promptMD:
     *                 type: string
     *                 example: "Which answer is *correct*?"
     *               promptHTML:
     *                 type: string
     *                 example: "<p>Which answer is <em>correct</em></p>?"
     *               answers:
     *                 type: array
     *                 items:
     *                   type: object
     *               allowTextResponses:
     *                 type: boolean
     *               blind:
     *                 type: boolean
     *               allowVoteChanges:
     *                 type: boolean
     *               allowMultipleResponses:
     *                 type: boolean
     *               weight:
     *                 type: number
     *               public:
     *                 type: boolean
     *               classId:
     *                 type: number
     *                 description: Optional. Active class ID to update in-memory student state.
     *     responses:
     *       200:
     *         description: Poll template saved
     *       401:
     *         description: Unauthenticated
     *       403:
     *         description: Insufficient permissions
     */
    router.post(
        "/user/:id/polls/templates",
        isAuthenticated,
        isSelfOrHasScopes(SCOPES.GLOBAL.USERS.MANAGE, "Not authorized to save polls for this user."),
        parseJson,
        async (req, res) => {
            const userId = req.params.id;
            req.infoEvent("poll.template.save.attempt", "Attempting to save poll template", { targetUserId: userId });

            const classId = req.body?.classId;
            const result = await saveUserPollTemplate(classId || null, req.body || {}, req.user);

            req.infoEvent("poll.template.save.success", "Poll template saved", {
                targetUserId: userId,
                pollId: result.pollId,
            });

            res.status(200).json({
                success: true,
                data: result,
            });
        }
    );
};
