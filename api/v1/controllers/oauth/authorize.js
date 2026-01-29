const authService = require("@services/auth-service");
const ValidationError = require("@errors/validation-error");
const { requireQueryParam } = require("@modules/error-wrapper");
const { isAuthenticated } = require("@modules/middleware/authentication");

module.exports = (router) => {
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
        const authorizationCode = authService.generateAuthorizationCode({ client_id, redirect_uri, scope, state, authorization });

        // Build redirect URL
        const url = new URL(redirect_uri);
        url.searchParams.append("code", authorizationCode);
        url.searchParams.append("state", state);

        res.status(302).redirect(url.toString());
    });
};
