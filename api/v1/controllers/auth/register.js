const authService = require("@services/auth-service");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/auth/register:
     *   post:
     *     summary: Register a new user
     *     tags:
     *       - Authentication
     *     description: Creates a new user account and returns authentication tokens
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - email
     *               - password
     *               - displayName
     *             properties:
     *               email:
     *                 type: string
     *                 format: email
     *               password:
     *                 type: string
     *                 format: password
     *               displayName:
     *                 type: string
     *     responses:
     *       201:
     *         description: User registered successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 accessToken:
     *                   type: string
     *                 refreshToken:
     *                   type: string
     *                 user:
     *                   type: object
     *                   properties:
     *                     id:
     *                       type: string
     *                     email:
     *                       type: string
     *                     displayName:
     *                       type: string
     *       400:
     *         description: Bad request - missing fields or registration failed
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
    router.post("/auth/register", async (req, res) => {
        const { email, password, displayName } = req.body;

        // Attempt to register the user
        const result = await authService.register(email, password, displayName);

        req.infoEvent("auth.register.success", `User registered: ${email}`, { userId: result.user.id });

        // Return the tokens and user data
        res.status(201).json({
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
    });
};
