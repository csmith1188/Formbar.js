const { createPoll } = require("@modules/polls");
const { hasClassPermission } = require("@modules/middleware/permission-check");
const { parseJson } = require("@modules/middleware/parse-json");
const { CLASS_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/polls/create:
     *   post:
     *     summary: Create a poll
     *     tags:
     *       - Class - Polls
     *     description: Creates a new poll in a class (requires poll control permissions)
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
     *               answers:
     *                 type: array
     *                 items:
     *                   type: string
     *                 example: ["3", "4", "5"]
     *               blind:
     *                 type: boolean
     *                 example: false
     *               weight:
     *                 type: number
     *                 example: 1
     *               tags:
     *                 type: array
     *                 items:
     *                   type: string
     *                 example: ["math"]
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
    router.post("/class/:id/polls/create", hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), parseJson, async (req, res) => {
        const classId = req.params.id;
        const body = req.body || {};
        const isLegacy =
            body.pollPrompt != null ||
            body.responseNumber != null ||
            body.polls != null ||
            body.blind != null ||
            body.responseTextBox != null ||
            body.multiRes != null;

        // Check if the request is legacy and remap them if so
        const pollData = isLegacy
            ? {
                  prompt: body.pollPrompt,
                  answers: Array.isArray(body.polls) ? body.polls : [],
                  blind: body.blind,
                  weight: body.weight,
                  tags: Array.isArray(body.tags) ? body.tags : (body.tags ?? []),
                  excludedRespondents: Array.isArray(body.boxes) ? body.boxes : undefined,
                  indeterminate: Array.isArray(body.indeterminate) ? body.indeterminate : [],
                  allowTextResponses: !!body.responseTextBox,
                  allowMultipleResponses: !!body.multiRes,
              }
            : body;

        await createPoll(classId, pollData, req.session.user);
        res.status(200).json({ success: true });
    });
};
