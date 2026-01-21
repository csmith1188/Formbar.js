const { logger } = require("@modules/logger");
const { settings } = require("@modules/config");
const userService = require("@services/user-service");
const ValidationError = require("@errors/validation-error");
const AppError = require("@errors/app-error");
const RateLimitError = require("@errors/rate-limit-error");

module.exports = (router) => {
    router.patch("/user/me/password", async (req, res) => {
        const { password, confirmPassword, token } = req.body;
        if (!password || !confirmPassword) {
            throw new ValidationError("Password and confirm password are required.");
        }

        if (!token) {
            throw new ValidationError("Token is required.");
        }

        if (password !== confirmPassword) {
            throw new ValidationError("Passwords do not match.");
        }

        await userService.resetPassword(password, token);
        res.status(200).json({ message: "Password has been reset successfully." });
    });

    router.post("/user/me/password/reset", async (req, res) => {
        const email = req.body.email;
        if (!email) {
            throw new ValidationError("Email is required.");
        }

        if (!settings.emailEnabled) {
            throw new AppError("Email service is not enabled. Password resets are not available at this time.");
        }

        await userService.requestPasswordReset(email);

        res.status(200).json({ message: "Password reset email has been sent." });
    });
};
