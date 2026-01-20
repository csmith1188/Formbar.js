const { logger } = require("@modules/logger");
const { httpPermCheck } = require("../middleware/permission-check");
const { joinRoom } = require("@modules/class/class");

module.exports = (router) => {
    try {
        /**
         * @swagger
         * /api/v1/room/{code}/join:
         *   post:
         *     summary: Join a classroom by code
         *     tags:
         *       - Room
         *     description: Allows a user to join a classroom using the room code
         *     parameters:
         *       - in: path
         *         name: code
         *         required: true
         *         description: The room code to join
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Successfully joined the room
         *       500:
         *         description: Server error
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ServerError'
         */
        // Joins a classroom
        router.post("/room/:code/join", httpPermCheck("joinRoom"), async (req, res) => {
            try {
                await joinRoom(req.session, req.params.code);
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
