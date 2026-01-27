const { logger } = require("@modules/logger");
const { classInformation } = require("@modules/class/classroom");
const { Student } = require("@modules/student");
const { settings } = require("@modules/config");
const { passport } = require("@modules/googleOauth");
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

    // Google OAuth callback
    router.get("/auth/google/callback", checkEnabled, (req, res, next) => {
        passport.authenticate("google", { session: false }, async (err, user) => {
            if (err) {
                logger.log("error", `[auth/google/callback] Passport error: ${err.message || err}`);
                throw new ValidationError("Authentication failed.");
            }

            if (!user || !user.emails || user.emails.length === 0) {
                logger.log("error", "[auth/google/callback] No email found in Google profile");
                throw new ValidationError("Could not retrieve email from Google account.");
            }

            const email = user.emails[0].value;
            const displayName = user.name ? `${user.name.givenName} ${user.name.familyName}` : email;

            logger.log("info", `[get /auth/google/callback] ip=(${req.ip}) email=(${email})`);

            // Authenticate the user via Google OAuth
            const result = await authService.googleOAuth(email, displayName);
            if (result.error) {
                logger.log("error", `[auth/google/callback] ${result.error}`);
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

            // Set session data (for backwards compatibility with session-based endpoints)
            req.session.user = classInformation.users[userData.email];
            req.session.userId = userData.id;
            req.session.email = userData.email;
            req.session.displayName = userData.displayName;
            req.session.verified = userData.verified;
            req.session.tags = userData.tags ? userData.tags.split(",") : [];

            logger.log("verbose", `[auth/google/callback] session=(${JSON.stringify(req.session)})`);

            res.json(tokens);
        })(req, res, next);
    });
};
