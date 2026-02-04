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
        throw new ForbiddenError("Google OAuth is not enabled on this server.", { event: "auth.oauth.failed", reason: "oauth_disabled" });
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
                req.infoEvent("auth.oauth.failed", "Google authentication failed", { reason: "auth_error" });
                throw new ValidationError("Authentication failed.", { event: "auth.oauth.failed", reason: "auth_error" });
            }

            if (!user || !user.emails || user.emails.length === 0) {
                req.infoEvent("auth.oauth.failed", "Could not retrieve email from Google", { reason: "missing_email" });
                throw new ValidationError("Could not retrieve email from Google account.", { event: "auth.oauth.failed", reason: "missing_email" });
            }

            const email = user.emails[0].value;
            const displayName = user.name ? `${user.name.givenName} ${user.name.familyName}` : email;

            // Authenticate the user via Google OAuth
            const result = await authService.googleOAuth(email, displayName);
            if (result.error) {
                req.infoEvent("auth.oauth.failed", `OAuth failed for: ${email}`, { reason: "service_error" });
                throw new ValidationError(result.error, { event: "auth.oauth.failed", reason: "service_error" });
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

            req.infoEvent("auth.oauth.success", `User authenticated via Google: ${email}`, { userId: userData.id });
            res.json(tokens);
        })(req, res, next);
    });
};
