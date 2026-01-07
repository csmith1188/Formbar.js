const { logger } = require("@modules/logger");
const authService = require("../../services/auth-service");

module.exports = (router) => {
    router.post("/auth/login", async (req, res) => {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: "Email and password are required." });
            }

            const result = await authService.login(email, password)
            if (result.code) {
                return res.json({ error: result });
            }

            res.json({ token: result });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "There was a server error. Please try again." });
        }
    });
};