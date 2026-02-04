const { settings } = require("@modules/config");
const userService = require("@services/user-service");
const ValidationError = require("@errors/validation-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    router.patch("/user/me/password", async (req, res) => {
        const { password, confirmPassword, token } = req.body;
        if (!password || !confirmPassword) {
            throw new ValidationError("Password and confirm password are required.", { event: "user.password.reset.failed", reason: "missing_fields" });
        }

        if (!token) {
            throw new ValidationError("Token is required.", { event: "user.password.reset.failed", reason: "missing_token" });
        }

        if (password !== confirmPassword) {
            throw new ValidationError("Passwords do not match.", { event: "user.password.reset.failed", reason: "password_mismatch" });
        }

        await userService.resetPassword(password, token);
        res.status(200).json({ message: "Password has been reset successfully." });
    });

    router.post("/user/me/password/reset", async (req, res) => {
        const email = req.body.email;
        if (!email) {
            throw new ValidationError("Email is required.", { event: "user.password.reset.request.failed", reason: "missing_email" });
        }

        if (!settings.emailEnabled) {
            throw new AppError("Email service is not enabled. Password resets are not available at this time.", { statusCode: 503, event: "user.password.reset.request.failed", reason: "email_disabled" });
        }

        await userService.requestPasswordReset(email);

        res.status(200).json({ message: "Password reset email has been sent." });
    });
};
