const { httpPermCheck } = require("@modules/middleware/permission-check");
const { leaveRoom } = require("@modules/class/class");
const { isAuthenticated } = require("@modules/middleware/authentication");

module.exports = (router) => {
    const leaveRoomHandler = async (req, res) => {
        await leaveRoom(req.user);
        res.status(200).json({ success: true });
    };

    /**
     * @swagger
     * /api/v1/room/{id}/leave:
     *   delete:
     *     summary: Leave a classroom entirely
     *     tags:
     *       - Room
     *     description: |
     *       Leaves the classroom entirely. The user is no longer attached to the classroom.
     *       This is different from leaving a class session - this completely removes the user from the classroom.
     *
     *       **Required Permission:** Class-specific `leaveRoom` permission
     *     security:
     *       - bearerAuth: []
     *       - sessionAuth: []
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
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     */
    router.delete("/room/:id/leave", isAuthenticated, httpPermCheck("leaveRoom"), leaveRoomHandler);

    // Deprecated endpoint - kept for backwards compatibility, use DELETE /api/v1/room/:id/leave instead
    router.post("/room/:id/leave", isAuthenticated, httpPermCheck("leaveRoom"), async (req, res) => {
        res.setHeader("X-Deprecated", "Use DELETE /api/v1/room/:id/leave instead");
        res.setHeader(
            "Warning",
            '299 - "Deprecated API: Use DELETE /api/v1/room/:id/leave instead. This endpoint will be removed in a future version."'
        );
        await leaveRoomHandler(req, res);
    });
};
