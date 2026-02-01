const authService = require("@services/auth-service");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/oauth/revoke:
     *   post:
     *     summary: OAuth 2.0 Token Revocation endpoint
     *     tags:
     *       - OAuth
     *     description: |
     *       Revokes an OAuth refresh token, invalidating it for future use.
     *       This endpoint returns 200 OK whether or not the token was found,
     *       to prevent token enumeration attacks.
     *
     *       **Required Permission:** None (public endpoint)
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
     *                 description: The refresh token to revoke
     *               token_type_hint:
     *                 type: string
     *                 enum: [refresh_token, access_token]
     *                 description: Optional hint about the token type (currently only refresh_token is supported)
     *     responses:
     *       200:
     *         description: |
     *           Token revocation request processed. This endpoint always returns 200 OK
     *           regardless of whether: the token was valid, the token was already revoked,
     *           or no token was provided. This behavior prevents token enumeration attacks.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     */
    router.post("/oauth/revoke", async (req, res) => {
        const { token, token_type_hint } = req.body;

        // Return 200 OK even if the token is invalid to prevent token enumeration attacks
        if (token) {
            // Only support revoking refresh tokens as access tokens are short-lived and not stored in the database
            if (!token_type_hint || token_type_hint === "refresh_token") {
                await authService.revokeOAuthToken(token);
            }
        }

        res.json({ success: true });
    });
};
