const { createStudentFromUserData } = require("@services/student-service");
const { classStateStore } = require("@services/classroom-service");
const authService = require("@services/auth-service");
const ValidationError = require("@errors/validation-error");

/**
 * Register login controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
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

        req.infoEvent("auth.login.attempt", "User login attempt", { email });

        // Attempt login through auth service
        const result = await authService.login(email, password);
        if (result.code) {
            throw new ValidationError("Could not log you in with those credentials. Try again.", { event: "auth.login.invalid", reason: "invalid_credentials" });
        }

        // If not already logged in, create a new Student instance in classInformation
        const { tokens, user: userData } = result;
        if (!classStateStore.getUser(userData.email)) {
            classStateStore.setUser(userData.email, createStudentFromUserData(userData, { isGuest: false }));
        }

        req.infoEvent("auth.login.success", "User logged in successfully", { userId: userData.id });

        res.json({
            success: true,
            data: {
                ...tokens,
            },
        });
    });
};
