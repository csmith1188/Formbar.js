const { logger } = require("@modules/logger");
const authService = require("@services/auth-service");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    router.post("/auth/register", async (req, res) => {
        const { email, password, displayName } = req.body;

        // Attempt to register the user
        const result = await authService.register(email, password, displayName);

        req.infoEvent("auth.register.success", `User registered: ${email}`, { userId: result.user.id });

        // Return the tokens and user data
        res.status(201).json({
            ...result.tokens,
            user: {
                id: result.user.id,
                email: result.user.email,
                displayName: result.user.displayName,
            },
        });
    });
};
