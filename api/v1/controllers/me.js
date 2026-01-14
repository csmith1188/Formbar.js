const { logger } = require("@modules/logger");
const { isAuthenticated } = require("./middleware/authentication");

module.exports = (router) => {
    try {
        /**
         * @swagger
         * /api/v1/me:
         *   get:
         *     summary: Get current user information
         *     tags:
         *       - Users
         *     description: Returns information about the currently authenticated user based on their session.
         *     responses:
         *       200:
         *         description: Current user information returned successfully
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/User'
         *       500:
         *         description: Server error
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ServerError'
         */
        // Gets the current user's information
        router.get("/me", isAuthenticated, async (req, res) => {
            try {
                logger.log("info", `[get api/me] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                res.status(200).json(req.session.user);
            } catch (err) {
                // If an error occurs, log the error and send an error message as a JSON response
                logger.log("error", err.stack);
                res.status(500).json({ error: "There was a server error try again." });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
