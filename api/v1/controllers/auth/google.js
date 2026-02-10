const { logger } = require("@modules/logger");
const { classInformation } = require("@modules/class/classroom");
const { Student } = require("@modules/student");
const { settings } = require("@modules/config");
const { passport } = require("@modules/google-oauth");
const authService = require("@services/auth-service");
const ForbiddenError = require("@errors/forbidden-error");
const ValidationError = require("@errors/validation-error");

// Middleware to check if Google OAuth is enabled
function checkEnabled(req, res, next) {
    if (settings.googleOauthEnabled) {
        next();
    } else {
        throw new ForbiddenError("Google OAuth is not enabled on this server.");
    }
}

module.exports = (router) => {
    // Initiate Google OAuth flow
    router.get(
        "/auth/google",
        checkEnabled,
        passport.authenticate("google", {
            scope: ["profile", "email"],
            session: false,
        })
    );

    /**
     * @swagger
     * /api/v1/auth/google/callback:
     *   get:
     *     summary: Google OAuth callback
     *     tags:
     *       - Authentication
     *     description: Handles the callback from Google OAuth and returns authentication tokens
     *     responses:
     *       200:
     *         description: Authentication successful
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 accessToken:
     *                   type: string
     *                 refreshToken:
     *                   type: string
     *       400:
     *         description: Authentication failed or email not available
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       403:
     *         description: Google OAuth is not enabled
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    // Google OAuth callback
    router.get("/auth/google/callback", checkEnabled, (req, res, next) => {
        passport.authenticate("google", { session: false }, async (err, user) => {
            if (err) {
                req.warnEvent("auth.google.error", `Passport error: ${err.message || err}`, { error: err.message || err });
                throw new ValidationError("Authentication failed.");
            }

            if (!user || !user.emails || user.emails.length === 0) {
                req.warnEvent("auth.google.no_email", "No email found in Google profile");
                throw new ValidationError("Could not retrieve email from Google account.");
            }

            const email = user.emails[0].value;
            const displayName = user.name ? `${user.name.givenName} ${user.name.familyName}` : email;

            req.infoEvent("auth.google.callback", `Google OAuth callback: ${email}`, { email, ip: req.ip });

            // Authenticate the user via Google OAuth
            const result = await authService.googleOAuth(email, displayName);
            if (result.error) {
                req.warnEvent("auth.google.oauth_error", result.error, { email });
                throw new ValidationError(result.error);
            }

            // If not already logged in, create a new Student instance in classInformation
            const { tokens, user: userData } = result;
            if (!classInformation.users[email]) {
                classInformation.users[email] = new Student(
                    userData.email,
                    userData.id,
                    userData.permissions,
                    userData.API,
                    JSON.parse(userData.ownedPolls || "[]"),
                    JSON.parse(userData.sharedPolls || "[]"),
                    userData.tags ? userData.tags.split(",") : [],
                    userData.displayName,
                    false
                );
            }

            res.json({
                success: true,
                data: {
                    ...result.tokens,
                    user: {
                        id: result.user.id,
                        email: result.user.email,
                        displayName: result.user.displayName,
                    },
                },
            });
        })(req, res, next);
    });
};
