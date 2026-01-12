const { logger } = require("@modules/logger");
const { classInformation } = require("@modules/class/classroom");
const { Student } = require("@modules/student");
const { dbGet } = require("@modules/database");
const authService = require("../../services/auth-service");
const jwt = require("jsonwebtoken");

module.exports = (router) => {
    router.post("/auth/login", async (req, res) => {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: "Email and password are required." });
            }

            logger.log("info", `[post /auth/login] ip=(${req.ip}) email=(${email})`);

            // Attempt login through auth service
            const result = await authService.login(email, password);
            if (result.code) {
                logger.log("verbose", "[post /auth/login] Invalid credentials");
                return res.status(401).json({ error: "Incorrect password. Try again." });
            }

            // If not already logged in, create a new Student instance in classInformation
            const userData = await dbGet("SELECT * FROM users WHERE email = ?", [email]);
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
            req.session.classId = classId;
            req.session.displayName = userData.displayName;
            req.session.verified = userData.verified;
            req.session.tags = userData.tags ? userData.tags.split(",") : [];

            logger.log("verbose", `[post /auth/login] session=(${JSON.stringify(req.session)})`);

            res.json({ token: result });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "There was a server error. Please try again." });
        }
    });
};
