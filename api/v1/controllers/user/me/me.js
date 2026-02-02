const { logger } = require("@modules/logger");
const { isAuthenticated } = require("@middleware/authentication");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/user/me:
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
    router.get("/user/me", isAuthenticated, async (req, res) => {
        res.status(200).json(req.session.user);
    });
};
