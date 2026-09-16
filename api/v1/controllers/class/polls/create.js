const { createPoll } = require("@services/poll-service");
const { isOwnerOrHasScopes } = require("@middleware/permission-check");
const { parseJson } = require("@middleware/parse-json");
const { SCOPES } = require("@modules/permissions");
const { isAuthenticated } = require("@middleware/authentication");
const ValidationError = require("@errors/validation-error");
const membershipService = require("@services/class-membership-service");

/**
 * Register create controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/polls/create:
     *   post:
     *     summary: Create a poll
     *     tags:
     *       - Class - Polls
     *     description: |
     *       Creates a new poll in a class.
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
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               prompt:
     *                 type: string
     *                 example: "What is 2+2?"
     *               promptMD:
     *                 type: string
     *                 example: "What is **2+2**"
     *               promptHTML:
     *                 type: string
     *                 example: "<p>What is <strong>2+2</strong></p>"
     *               answers:
     *                 type: array
     *                 items:
     *                   type: object
     *                   properties:
     *                     answer:
     *                       type: string
     *                     correct:
     *                       type: boolean
     *                     color:
     *                       type: string
     *                     weight:
     *                       type: number
     *                 example: [{"answer":"2","weight":0.9,"color":"#00FF00","correct":false},{"answer":"3","weight":1,"color":"#00FFFF","correct":false},{"answer":"4","weight":1.1,"color":"#FF0000","correct":true}]
     *               blind:
     *                 type: boolean
     *                 example: false
     *               weight:
     *                 type: number
     *                 example: 1
     *               excludedRespondents:
     *                 type: array
     *                 items:
     *                   type: string
     *                 example: []
     *               indeterminate:
     *                 type: array
     *                 items:
     *                   type: string
     *                 example: []
     *               allowTextResponses:
     *                 type: boolean
     *                 example: true
     *               allowMultipleResponses:
     *                 type: boolean
     *                 example: false
     *               autoEndTimer:
     *                 type: number
     *                 example: 10
     *               autoEndThreshold:
     *                 type: number
     *                 example: 50
     *               blindUntilEnded:
     *                 type: boolean
     *                 example: false
     *     responses:
     *       200:
     *         description: Poll created successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       403:
     *         description: Insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post(
        "/class/:id/polls/create",
        isAuthenticated,
        isOwnerOrHasScopes(
            membershipService.classroomOwnerCheck,
            SCOPES.CLASS.POLL.CREATE,
            "You don't have permission to create polls for this class."
        ),
        parseJson,
        async (req, res) => {
            const classId = req.params.id;
            const body = req.body || {};
            req.infoEvent("class.poll.create.attempt", "Attempting to create poll", { classId });
            const isLegacy =
                body.pollPrompt != null || body.responseNumber != null || body.polls != null || body.responseTextBox != null || body.multiRes != null;

            // Check if the request is legacy and remap them if so
            const pollData = isLegacy
                ? {
                      prompt: body.pollPrompt,
                      answers: Array.isArray(body.polls) ? body.polls : [],
                      blind: body.blind,
                      weight: body.weight,
                      excludedRespondents: Array.isArray(body.boxes) ? body.boxes : undefined,
                      indeterminate: Array.isArray(body.indeterminate) ? body.indeterminate : [],
                      allowTextResponses: !!body.responseTextBox,
                      allowMultipleResponses: !!body.multiRes,
                      autoEndTimer: body.autoEndTimer,
                      autoEndThreshold: body.autoEndThreshold,
                      blindUntilEnded: body.blindUntilEnded != null ? !!body.blindUntilEnded : undefined,
                  }
                : body;


            await createPoll(classId, pollData, req.user);
            req.infoEvent("class.poll.create.success", "Poll created", { classId });
            res.status(200).json({
                success: true,
                data: {},
            });
        }
    );
};
