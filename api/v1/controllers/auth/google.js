const { logger } = require("@modules/logger");
const { classInformation } = require("@modules/class/classroom");
const { Student } = require("@modules/student");
const { settings } = require("@modules/config");
const { passport } = require("@modules/googleOauth");
const authService = require("../../services/auth-service");

// Middleware to check if Google OAuth is enabled
function checkEnabled(req, res, next) {
    if (settings.googleOauthEnabled) {
        next();
    } else {
        res.status(403).json({ error: "Google OAuth is not enabled on this server." });
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
            try {
                if (err) {
                    logger.log("error", `[auth/google/callback] Passport error: ${err.message || err}`);
                    return res.status(400).json({ error: "Authentication failed." });
                }

                if (!user || !user.emails || user.emails.length === 0) {
                    logger.log("error", "[auth/google/callback] No email found in Google profile");
                    return res.status(400).json({ error: "Could not retrieve email from Google account." });
                }

                const email = user.emails[0].value;
                const displayName = user.name ? `${user.name.givenName} ${user.name.familyName}` : email;

                logger.log("info", `[get /auth/google/callback] ip=(${req.ip}) email=(${email})`);

                // Authenticate the user via Google OAuth
                const result = await authService.googleOAuth(email, displayName);
                if (result.error) {
                    logger.log("error", `[auth/google/callback] ${result.error}`);
                    return res.status(400).json({ error: result.error });
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
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: "There was a server error. Please try again." });
            }
        })(req, res, next);
    });
};
