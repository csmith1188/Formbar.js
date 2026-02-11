const authService = require("@services/auth-service");
const ValidationError = require("@errors/validation-error");
const AuthError = require("@errors/auth-error");

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
     *                 accessToken:
     *                   type: string
     *                   description: New access token
     *                 refreshToken:
     *                   type: string
     *                   description: New refresh token
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
        const { token } = req.body;
        if (!token) {
            throw new ValidationError("A refresh token is required.", { event: "auth.refresh.failed", reason: "missing_token" });
        }

        const result = await authService.refreshLogin(token);
        if (result.code) {
            throw new AuthError(result, { event: "auth.refresh.failed", reason: "invalid_token" });
        }

        res.status(200).json({
            success: true,
            data: {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
            },
        });
    });
};
