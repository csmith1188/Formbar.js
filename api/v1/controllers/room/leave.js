const { logger } = require("@modules/logger");
const { httpPermCheck } = require("../middleware/permission-check");
const { leaveRoom } = require("@modules/class/class");

module.exports = (router) => {
    try {
        /**
         * @swagger
         * /api/v1/class/{id}/leave:
         *   post:
         *     summary: Leave a classroom
         *     tags:
         *       - Room
         *     description: Allows a user to leave a classroom. The user will no longer be attached to the classroom.
         *     parameters:
         *       - in: path
         *         name: id
         *         required: true
         *         description: The ID of the class to leave
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Successfully left the classroom
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 message:
         *                   type: string
         *                   example: "Success"
         *       500:
         *         description: Server error
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ServerError'
         */
        // Leaves the classroom entirely
        // The user is no longer attached to the classroom
        router.post("/class/:id/leave", httpPermCheck("leaveRoom"), async (req, res) => {
            try {
                await leaveRoom(socket.request.session);
                res.status(200).json({ message: "Success" });
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
