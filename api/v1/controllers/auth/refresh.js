const { logger } = require("@modules/logger");
const authService = require("../../services/auth-service");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/auth/refresh:
     *   post:
     *     summary: Refresh access token
     *     tags:
     *       - Authentication
     *     description: Exchanges a refresh token for a new access token
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - token
     *             properties:
     *               token:
     *                 type: string
     *                 description: Refresh token
     *     responses:
     *       200:
     *         description: Token refreshed successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 token:
     *                   type: string
     *       400:
     *         description: Refresh token is required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       401:
     *         description: Invalid refresh token
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.post("/auth/refresh", async (req, res) => {
        try {
            const { token } = req.body;
            if (!token) {
                return res.status(400).json({ error: "A refresh token is required." });
            }

            const result = await authService.refreshLogin(token);
            if (result.code) {
                return res.status(401).json({ error: result });
            }

            res.status(200).json({ token: result });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "There was a server error. Please try again." });
        }
    });
};
