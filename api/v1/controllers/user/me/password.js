const { logger } = require("@modules/logger");
const { settings } = require("@modules/config");
const userService = require("@services/user-service");

module.exports = (router) => {
    router.patch("/user/me/password", async (req, res) => {
        try {
            const { password, confirmPassword, token } = req.body;
            if (!password || !confirmPassword) {
                return res.status(400).json({ error: "Password and confirm password are required." });
            }

            if (!token) {
                return res.status(400).json({ error: "Token is required." });
            }

            if (password !== confirmPassword) {
                return res.status(400).json({ error: "Passwords do not match." });
            }

            await userService.resetPassword(password, token);
            res.status(200).json({ message: "Password has been reset successfully." });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "There was a server error. Please try again." });
        }
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
        try {
            const email = req.body.email;
            if (!email) {
                return res.status(400).json({ error: "Email is required." });
            }

            if (!settings.emailEnabled) {
                return res.status(503).json({ error: "Email service is not enabled. Password resets are not available at this time." });
            }

            await userService.requestPasswordReset(email);

            res.status(200).json({ message: "Password reset email has been sent." });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "There was a server error. Please try again." });
        }
    });
};
