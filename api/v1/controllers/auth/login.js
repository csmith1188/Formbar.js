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
     *     description: |
     *       Authenticates a user and returns access and refresh tokens.
     *
     *       **Required Permission:** None (public endpoint)
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

        req.infoEvent("auth.login.attempt", "User login attempt");

        // Attempt login through auth service
        const result = await authService.login(email, password);
        if (result.code) {
            throw new ValidationError("Incorrect password. Try again.", { event: "auth.login.invalid", reason: "invalid_credentials" });
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

        req.infoEvent("auth.login.success", "User logged in successfully");

        res.json({
            success: true,
            data: {
                ...tokens,
            },
        });
    });
};
