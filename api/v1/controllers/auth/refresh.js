const { logger } = require("@modules/logger");
const authService = require("../../services/auth-service");

module.exports = (router) => {
    router.post("/auth/refresh", async (req, res) => {
        try {
            const { token } = req.body;
            if (!token) {
                return res.status(400).json({ error: "A refresh token is required." });
            }

            const result = await authService.refreshLogin(token);
            if (result.code) {
                return res.status(500).json({ error: result });
            }

            res.status(200).json({ token: result });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "There was a server error. Please try again." });
        }
    });
};