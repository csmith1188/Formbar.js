const { logger } = require("@modules/logger");
const authService = require("../../services/auth-service");

module.exports = (router) => {
    router.post("/auth/register", async (req, res) => {
        try {
            const { email, password, displayName } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: "Email and password are required." });
            }

            if (!displayName) {
                return res.status(400).json({ error: "Display name is required." });
            }

            logger.log("info", `[post /auth/register] ip=(${req.ip}) email=(${email})`);

            // Attempt to register the user
            const result = await authService.register(email, password, displayName);
            if (result.error) {
                logger.log("verbose", `[post /auth/register] Registration failed: ${result.error}`);
                return res.status(400).json({ error: result.error });
            }

            logger.log("verbose", `[post /auth/register] User registered successfully: ${email}`);

            // Return the tokens and user data
            res.status(201).json({
                token: result.tokens,
                user: {
                    id: result.user.id,
                    email: result.user.email,
                    displayName: result.user.displayName,
                },
            });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "There was a server error. Please try again." });
        }
    });
};
