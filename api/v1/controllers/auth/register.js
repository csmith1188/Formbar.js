const { logger } = require("@modules/logger");
const authService = require("@services/auth-service");
const ValidationError = require("@errors/validation-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    router.post("/auth/register", async (req, res) => {
        const { email, password, displayName } = req.body;
        if (!email || !password) {
            throw new ValidationError("Email and password are required.");
        }

        if (!displayName) {
            throw new ValidationError("Display name is required.");
        }

        logger.log("info", `[post /auth/register] ip=(${req.ip}) email=(${email})`);

        // Attempt to register the user
        const result = await authService.register(email, password, displayName);
        if (result.error) {
            logger.log("verbose", `[post /auth/register] Registration failed: ${result.error}`);
            throw new ValidationError(result.error);
        }

        logger.log("verbose", `[post /auth/register] User registered successfully: ${email}`);

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
