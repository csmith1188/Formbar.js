const { logger } = require("@modules/logger");
const { classInformation } = require("@modules/class/classroom");
const { Student } = require("@modules/student");
const authService = require("@services/auth-service");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/auth/login:
     *   post:
     *     summary: Login with email and password
     *     tags:
     *       - Authentication
     *     description: Authenticates a user and returns access and refresh tokens
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - email
     *               - password
     *             properties:
     *               email:
     *                 type: string
     *                 format: email
     *               password:
     *                 type: string
     *                 format: password
     *     responses:
     *       200:
     *         description: Login successful
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
     *         description: Missing email or password
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       401:
     *         description: Invalid credentials
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.post("/auth/login", async (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) {
            throw new ValidationError("Email and password are required.");
        }

        logger.log("info", `[post /auth/login] ip=(${req.ip}) email=(${email})`);

        // Attempt login through auth service
        const result = await authService.login(email, password);
        if (result.code) {
            logger.log("verbose", "[post /auth/login] Invalid credentials");
            throw new ValidationError("Incorrect password. Try again.");
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

        logger.log("verbose", `[post /auth/login] session=(${JSON.stringify(req.session)})`);

        res.json(tokens);
    });
};
