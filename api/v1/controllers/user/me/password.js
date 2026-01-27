const { settings } = require("@modules/config");
const userService = require("@services/user-service");
const ValidationError = require("@errors/validation-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    router.patch("/user/me/password", async (req, res) => {
        const { password, confirmPassword, token } = req.body;
        if (!password || !confirmPassword) {
            throw new ValidationError("Password and confirm password are required.");
        }

        if (!token) {
            throw new ValidationError("Token is required.");
        }

        if (password !== confirmPassword) {
            throw new ValidationError("Passwords do not match.");
        }

        await userService.resetPassword(password, token);
        res.status(200).json({ message: "Password has been reset successfully." });
    });

    /**
     * @swagger
     * /api/v1/user/me/password/reset:
     *   post:
     *     summary: Request password reset email
     *     tags:
     *       - Authentication
     *     description: Sends a password reset email to the specified email address
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - email
     *             properties:
     *               email:
     *                 type: string
     *                 format: email
     *     responses:
     *       200:
     *         description: Password reset email sent
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *       400:
     *         description: Email is required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       503:
     *         description: Email service not enabled
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
    router.post("/user/me/password/reset", async (req, res) => {
        const email = req.body.email;
        if (!email) {
            throw new ValidationError("Email is required.");
        }

        if (!settings.emailEnabled) {
            throw new AppError("Email service is not enabled. Password resets are not available at this time.", 503);
        }

        await userService.requestPasswordReset(email);

        res.status(200).json({ message: "Password reset email has been sent." });
    });
};
