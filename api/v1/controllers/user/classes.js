const { logger } = require("@modules/logger");
const { dbGet } = require("@modules/database");
const { getUserOwnedClasses } = require("@modules/user/user");
const { httpPermCheck } = require("../middleware/permission-check");

module.exports = (router) => {
    try {
        /**
         * @swagger
         * /api/v1/user/{id}/classes:
         *   get:
         *     summary: Get user's owned classes
         *     tags:
         *       - Users
         *     description: Returns a list of classes owned by the specified user
         *     parameters:
         *       - in: path
         *         name: id
         *         required: true
         *         description: The ID of the user
         *         schema:
         *           type: string
         *           example: "1"
         *     responses:
         *       200:
         *         description: List of owned classes retrieved successfully
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         *       404:
         *         description: User not found
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/Error'
         *       500:
         *         description: Server error
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ServerError'
         */
        // Gets a user's owned classes
        router.get("/user/:id/classes", httpPermCheck("getOwnedClasses"), async (req, res) => {
            try {
                const userId = req.params.id;
                const user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
                if (!user) {
                    return res.json({ error: "User not found" });
                }

                const ownedClasses = await getUserOwnedClasses(user.email, req.session.user);
                res.status(200).json(ownedClasses);
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).send(`Error: ${err.message}`);
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
