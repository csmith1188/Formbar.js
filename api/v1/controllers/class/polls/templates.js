const { saveClassPollTemplate, getClassPollTemplates } = require("@services/poll-service");
const { isOwnerOrHasScopes } = require("@middleware/permission-check");
const { parseJson } = require("@middleware/parse-json");
const { SCOPES } = require("@modules/permissions");
const { isAuthenticated } = require("@middleware/authentication");
const membershipService = require("@services/class-membership-service");

/**
 * Register save-class-template controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/polls/templates/class:
     *   get:
     *     summary: Get saved class poll templates
     *     tags:
     *       - Class - Polls
     *     description: |
     *       Returns poll templates saved to the class library.
     *
     *       **Required Permission:** `class.poll.create`
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
     *         description: Class poll templates retrieved
     *       403:
     *         description: Insufficient permissions
     */
    router.get(
        "/class/:id/polls/templates",
        isAuthenticated,
        isOwnerOrHasScopes(
            membershipService.classroomOwnerCheck,
            SCOPES.CLASS.POLL.CREATE,
            "You don't have permission to view class poll templates."
        ),
        async (req, res) => {
            const classId = req.params.id;

            req.infoEvent("class.poll.template.class_list.attempt", "Attempting to list class poll templates", {
                classId,
            });

            const polls = await getClassPollTemplates(classId);

            req.infoEvent("class.poll.template.class_list.success", "Class poll templates returned", {
                classId,
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
     * /api/v1/class/{id}/polls/templates/class:
     *   post:
     *     summary: Save a poll template to the class library
     *     tags:
     *       - Class - Polls
     *     description: |
     *       Saves the poll editor configuration as a class poll template so other teachers in the class can use it.
     *
     *       **Required Permission:** `class.poll.create`
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
     *             required:
     *               - name
     *               - prompt
     *               - promptMD
     *               - promptHTML
     *               - answers
     *             properties:
     *               name:
     *                 type: string
     *               prompt:
     *                 type: string
     *               promptMD:
     *                 type: string
     *               promptHTML:
     *                 type: string
     *               answers:
     *                 type: array
     *                 items:
     *                   type: object
     *     responses:
     *       200:
     *         description: Poll template saved to the class
     *       403:
     *         description: Insufficient permissions
     */
    router.post(
        "/class/:id/polls/templates",
        isAuthenticated,
        isOwnerOrHasScopes(
            membershipService.classroomOwnerCheck,
            SCOPES.CLASS.POLL.CREATE,
            "You don't have permission to save class polls for this class."
        ),
        parseJson,
        async (req, res) => {
            const classId = req.params.id;
            req.infoEvent("class.poll.template.class_save.attempt", "Attempting to save class poll template", {
                classId,
            });

            const result = await saveClassPollTemplate(classId, req.body || {}, req.user);

            req.infoEvent("class.poll.template.class_save.success", "Class poll template saved", {
                classId,
                pollId: result.pollId,
            });

            res.status(200).json({
                success: true,
                data: result,
            });
        }
    );
};
