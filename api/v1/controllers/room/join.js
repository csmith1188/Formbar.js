const { httpPermCheck } = require("@middleware/permission-check");
const { joinRoom } = require("@services/room-service");
const { isAuthenticated } = require("@middleware/authentication");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/room/{code}/join:
     *   post:
     *     summary: Join a room with a code
     *     tags:
     *       - Room
     *     description: |
     *       Joins a classroom using a room code.
     *
     *       **Required Permission:** Global Guest permission (level 1)
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
     *         name: code
     *         required: true
     *         schema:
     *           type: string
     *         description: Room code
     *     responses:
     *       200:
     *         description: Successfully joined the room
     *       400:
     *         description: Invalid code or unable to join
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
    router.post("/room/:code/join", isAuthenticated, httpPermCheck("joinRoom"), async (req, res) => {
        const code = req.params.code;
        req.infoEvent("room.join.attempt", "User attempting to join room", { code });

        await joinRoom(req.user, code);

        req.infoEvent("room.join.success", "User joined room successfully", { code });
        res.status(200).json({
            success: true,
            data: {},
        });
    });
};
