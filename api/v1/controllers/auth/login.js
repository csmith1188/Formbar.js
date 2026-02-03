const { logger } = require("@modules/logger");
const { classInformation } = require("@modules/class/classroom");
const { Student } = require("@modules/student");
const authService = require("@services/auth-service");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    router.post("/auth/login", async (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) {
            throw new ValidationError("Email and password are required.", {event: "auth.login.failed"});
        }

        // Attempt login through auth service
        const result = await authService.login(email, password);
        if (result.code) {
            throw new ValidationError("Incorrect password. Try again.", {event: "auth.login.failed"});
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

        res.json(tokens);
    });
};
