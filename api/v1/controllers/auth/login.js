const { logger } = require("@modules/logger");
const authService = require("../../services/auth-service");
const { classInformation } = require("@modules/class/classroom");
const { Student } = require("@modules/student");
const { dbGet, dbGetAll, dbRun } = require("@modules/database");
const { managerUpdate } = require("@modules/socketUpdates");
const jwt = require("jsonwebtoken");

module.exports = (router) => {
    router.post("/auth/login", async (req, res) => {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: "Email and password are required." });
            }

            logger.log("info", `[post /auth/login] ip=(${req.ip}) email=(${email})`);

            // First, check if user exists in the main users table
            const userData = await dbGet(
                "SELECT users.*, CASE WHEN shared_polls.pollId IS NULL THEN json_array() ELSE json_group_array(DISTINCT shared_polls.pollId) END as sharedPolls, CASE WHEN custom_polls.id IS NULL THEN json_array() ELSE json_group_array(DISTINCT custom_polls.id) END as ownedPolls FROM users LEFT JOIN shared_polls ON shared_polls.userId = users.id LEFT JOIN custom_polls ON custom_polls.owner = users.id WHERE users.email=? GROUP BY users.id",
                [email]
            );

            // If user doesn't exist, check if they're unverified
            if (!userData || !userData.email) {
                // Check temp_user_creation_data for unverified users
                const tempUsers = await dbGetAll("SELECT * FROM temp_user_creation_data");
                let tempUser = null;

                for (const temp of tempUsers) {
                    const decoded = jwt.decode(temp.token);
                    if (decoded && decoded.email === email && typeof decoded.hashedPassword === "string" && decoded.hashedPassword.length > 0) {
                        // Verify password matches
                        const { compare } = require("bcrypt");
                        const passwordMatches = await compare(password, decoded.hashedPassword);
                        if (passwordMatches) {
                            tempUser = { ...decoded, secret: temp.secret };
                            break;
                        }
                    }
                }

                if (tempUser) {
                    logger.log("verbose", "[post /auth/login] User exists but is unverified");
                    return res.status(403).json({
                        error: "Email not verified. Please check your email for the verification link.",
                        code: "EMAIL_NOT_VERIFIED",
                        email: email,
                        secret: tempUser.secret,
                    });
                }

                logger.log("verbose", "[post /auth/login] User does not exist");
                return res.status(401).json({ error: "No user found with that email." });
            }

            // Check if the user has a password set
            if (!userData.password) {
                logger.log("verbose", "[post /auth/login] User does not have a password set");
                return res.status(401).json({ error: "This account does not have a password set." });
            }

            // Attempt login through auth service
            const result = await authService.login(email, password);
            if (result.code) {
                logger.log("verbose", "[post /auth/login] Invalid credentials");
                return res.status(401).json({ error: "Incorrect password. Try again." });
            }

            // If the user does not have a display name, set it to their email
            if (!userData.displayName) {
                await dbRun("UPDATE users SET displayName = ? WHERE email = ?", [userData.email, userData.email]);
                userData.displayName = userData.email;
                logger.log("verbose", "[post /auth/login] Added displayName to database");
            }

            // Check if the user is already logged into a class
            let loggedIn = false;
            let classId = null;
            for (let classData of Object.values(classInformation.classrooms)) {
                if (classData.key) {
                    for (let studentEmail of Object.keys(classData.students)) {
                        if (studentEmail === userData.email) {
                            loggedIn = true;
                            classId = classData.id;
                            break;
                        }
                    }
                }
                if (loggedIn) break;
            }

            // If not already logged in, create a new Student instance in classInformation
            if (!loggedIn) {
                classInformation.users[userData.email] = new Student(
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
                classId = null;
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

            // Notify managers of user login
            managerUpdate();

            res.json({ token: result });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "There was a server error. Please try again." });
        }
    });
};
