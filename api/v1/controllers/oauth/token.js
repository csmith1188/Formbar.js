const authService = require("@services/auth-service");
const ValidationError = require("@errors/validation-error");
const { requireQueryParam } = require("@modules/error-wrapper");

module.exports = (router) => {
    router.post("/oauth/token", async (req, res) => {
        const { grant_type, code, redirect_uri, client_id, refresh_token } = req.body;

        requireQueryParam(grant_type, "grant_type");

        let tokenResponse;
        if (grant_type === "authorization_code") {
            requireQueryParam(code, "code");
            requireQueryParam(redirect_uri, "redirect_uri");
            requireQueryParam(client_id, "client_id");

            tokenResponse = await authService.exchangeAuthorizationCodeForToken({ code, redirect_uri, client_id });
        } else if (grant_type === "refresh_token") {
            requireQueryParam(refresh_token, "refresh_token");

            tokenResponse = await authService.exchangeRefreshTokenForAccessToken({ refresh_token });
        }

        if (!tokenResponse) {
            throw new ValidationError("Invalid grant_type or parameters.");
        }

        res.json(tokenResponse);
    });
};
