const { logger } = require("@modules/logger");
const { settings } = require("@modules/config");
const userService = require("@services/user-service");

module.exports = (router) => {
    router.patch("/user/me/password", async (req, res) => {
        try {
            const { password, confirmPassword, token } = req.body;
            if (!password || !confirmPassword) {
                return res.status(400).json({ error: "Password and confirm password are required." });
            }

            if (!token) {
                return res.status(400).json({ error: "Token is required." });
            }

            if (password !== confirmPassword) {
                return res.status(400).json({ error: "Passwords do not match." });
            }

            const result = await userService.resetPassword(password, token);
            if (result instanceof Error) {
                res.status(400).json({ error: result.error });
            }

            res.status(200).json({ message: "Password has been reset successfully." });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "There was a server error try again." });
        }
    });

    router.post("/user/me/password/reset", async (req, res) => {
        try {
            const email = req.body.email;
            if (!email) {
                return res.status(400).json({ error: "Email is required." });
            }

            if (!settings.emailEnabled) {
                return res.status(503).json({ error: "Email service is not enabled. Password resets are not available at this time." });
            }

            const result = await userService.requestPasswordReset(email);
            if (result instanceof Error) {
                return res.status(400).json({ error: result.error });
            }
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "There was a server error try again." });
        }
    });
};
