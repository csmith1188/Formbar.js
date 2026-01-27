const { hasClassPermission } = require("@modules/middleware/permission-check");
const { parseJson } = require("@modules/middleware/parse-json");
const { CLASS_PERMISSIONS } = require("@modules/permissions");
const { updatePoll } = require("@modules/polls");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/polls/end:
     *   post:
     *     summary: End the current poll
     *     tags:
     *       - Class - Polls
     *     description: Ends the current poll for a class (requires poll control permissions)
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
     *       403:
     *         description: Insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post("/class/:id/polls/end", hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), parseJson, async (req, res) => {
        const classId = req.params.id;
        await updatePoll(classId, { status: false }, req.session);
        res.status(200).json({ success: true });
    });
};
