const authService = require("@services/auth-service");
const ValidationError = require("@errors/validation-error");
const AuthError = require("@errors/auth-error");

module.exports = (router) => {
    router.post("/auth/refresh", async (req, res) => {
        const { token } = req.body;
        if (!token) {
            throw new ValidationError("A refresh token is required.");
        }

        const result = await authService.refreshLogin(token);
        if (result.code) {
            throw new AuthError(result);
        }

        res.status(200).json({ token: result });
    });
};
