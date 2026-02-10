const authService = require("@services/auth-service");
const ValidationError = require("@errors/validation-error");
const { requireQueryParam } = require("@modules/error-wrapper");
const { isAuthenticated } = require("@middleware/authentication");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/oauth/authorize:
     *   get:
     *     summary: OAuth 2.0 Authorization endpoint
     *     tags:
     *       - OAuth
     *     description: |
     *       Initiates the OAuth 2.0 authorization code flow. Redirects the user to the
     *       specified redirect URI with an authorization code that can be exchanged for tokens.
     *
     *       **Required Permission:** Authenticated user (via session or JWT)
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: query
     *         name: response_type
     *         schema:
     *           type: string
     *           enum: [code]
     *         description: Must be 'code' for authorization code flow (optional, defaults to 'code')
     *       - in: query
     *         name: client_id
     *         required: true
     *         schema:
     *           type: string
     *         description: The client application's identifier
     *       - in: query
     *         name: redirect_uri
     *         required: true
     *         schema:
     *           type: string
     *           format: uri
     *         description: URI to redirect to after authorization
     *       - in: query
     *         name: scope
     *         required: true
     *         schema:
     *           type: string
     *         description: Space-delimited list of requested scopes
     *       - in: query
     *         name: state
     *         required: true
     *         schema:
     *           type: string
     *         description: CSRF protection token, returned unchanged in the redirect
     *     responses:
     *       302:
     *         description: Redirects to redirect_uri with authorization code and state
     *       400:
     *         description: Missing required parameters or unsupported response_type
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       401:
     *         description: User not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     */
    router.get("/oauth/authorize", isAuthenticated, async (req, res) => {
        const { response_type, client_id, redirect_uri, scope, state } = req.query;
        const { authorization } = req.headers;

        // If response_type is provided, validate it
        // If not, we can assume default behavior
        if (response_type && response_type !== "code") {
            throw new ValidationError("Unsupported response_type. Only 'code' is supported.");
        }

        // Validate required parameters
        requireQueryParam(client_id, "client_id");
        requireQueryParam(redirect_uri, "redirect_uri");
        requireQueryParam(scope, "scope");
        requireQueryParam(state, "state");

        // Create an authorization token for the client
        const authorizationCode = authService.generateAuthorizationCode({ client_id, redirect_uri, scope, authorization });

        // Build redirect URL
        let url;
        try {
            url = new URL(redirect_uri);
        } catch (err) {
            throw new ValidationError("Invalid redirect_uri. It must be a valid absolute URL.");
        }
        url.searchParams.append("code", authorizationCode);
        url.searchParams.append("state", state);

        res.status(302).redirect(url.toString());
    });
};
