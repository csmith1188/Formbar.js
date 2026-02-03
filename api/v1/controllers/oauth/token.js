const authService = require("@services/auth-service");
const ValidationError = require("@errors/validation-error");
const { requireBodyParam } = require("@modules/error-wrapper");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/oauth/token:
     *   post:
     *     summary: OAuth 2.0 Token endpoint
     *     tags:
     *       - OAuth
     *     description: |
     *       Exchanges an authorization code or refresh token for access tokens.
     *
     *       **Supported grant types:**
     *       - `authorization_code`: Exchange an authorization code for tokens
     *       - `refresh_token`: Exchange a refresh token for new tokens
     *
     *       **Required Permission:** None (public endpoint)
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - grant_type
     *             properties:
     *               grant_type:
     *                 type: string
     *                 enum: [authorization_code, refresh_token]
     *                 description: The type of grant being requested
     *               code:
     *                 type: string
     *                 description: Authorization code (required for authorization_code grant)
     *               redirect_uri:
     *                 type: string
     *                 format: uri
     *                 description: Redirect URI (required for authorization_code grant)
     *               client_id:
     *                 type: string
     *                 description: Client ID (required for authorization_code grant)
     *               refresh_token:
     *                 type: string
     *                 description: Refresh token (required for refresh_token grant)
     *     responses:
     *       200:
     *         description: Token response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 access_token:
     *                   type: string
     *                   description: JWT access token
     *                 token_type:
     *                   type: string
     *                   example: Bearer
     *                 expires_in:
     *                   type: integer
     *                   description: Token lifetime in seconds
     *                   example: 900
     *                 refresh_token:
     *                   type: string
     *                   description: Refresh token for obtaining new access tokens
     *       400:
     *         description: Invalid grant_type or missing required parameters
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       401:
     *         description: Invalid authorization code or refresh token
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     */
    router.post("/oauth/token", async (req, res) => {
        const { grant_type, code, redirect_uri, client_id, refresh_token } = req.body;

        requireBodyParam(grant_type, "grant_type");

        let tokenResponse;

        if (grant_type === "authorization_code") {
            requireBodyParam(code, "code");
            requireBodyParam(redirect_uri, "redirect_uri");
            requireBodyParam(client_id, "client_id");

            tokenResponse = await authService.exchangeAuthorizationCodeForToken({ code, redirect_uri, client_id });
        } else if (grant_type === "refresh_token") {
            requireBodyParam(refresh_token, "refresh_token");

            tokenResponse = await authService.exchangeRefreshTokenForAccessToken({ refresh_token });
        }

        if (!tokenResponse) {
            throw new ValidationError("Invalid grant_type. Supported values: 'authorization_code', 'refresh_token'.");
        }

        res.json(tokenResponse);
    });
};
