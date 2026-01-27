const { httpPermCheck } = require("@modules/middleware/permission-check");
const { leaveRoom } = require("@modules/class/class");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/leave:
     *   post:
     *     summary: Leave a classroom entirely
     *     tags:
     *       - Room
     *     description: Leaves the classroom entirely. The user is no longer attached to the classroom.
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
     *     responses:
     *       200:
     *         description: Successfully left the classroom
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       400:
     *         description: Unable to leave classroom
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post("/class/:id/leave", httpPermCheck("leaveRoom"), async (req, res) => {
        await leaveRoom(req.session);
        res.status(200).json({ success: true });
    });
};
