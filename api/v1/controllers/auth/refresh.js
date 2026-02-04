const authService = require("@services/auth-service");
const ValidationError = require("@errors/validation-error");
const AuthError = require("@errors/auth-error");

module.exports = (router) => {
    router.post("/auth/refresh", async (req, res) => {
        const { token } = req.body;
        if (!token) {
            throw new ValidationError("A refresh token is required.", { event: "auth.refresh.failed", reason: "missing_token" });
        }

        const result = await authService.refreshLogin(token);
        if (result.code) {
            req.infoEvent("auth.refresh.failed", "Invalid refresh token", { reason: "invalid_token" });
            throw new AuthError(result, { event: "auth.refresh.failed", reason: "invalid_token" });
        }

        res.status(200).json({ token: result });
    });
};
