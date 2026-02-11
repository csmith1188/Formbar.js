const { isAuthenticated } = require("@middleware/authentication");
const { dbGet } = require("@modules/database");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/user/me:
     *   get:
     *     summary: Get current user information
     *     tags:
     *       - Users
     *     description: Returns information about the currently authenticated user based on their session.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     responses:
     *       200:
     *         description: Current user information returned successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/User'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    // Gets the current user's information
    router.get("/user/me", isAuthenticated, async (req, res) => {
        req.infoEvent("user.me.view", "User viewing own data", { userId: req.user.id });

        const { digipogs } = await dbGet("SELECT digipogs FROM users WHERE id = ?", [req.user.id]);
        res.status(200).json({
            success: true,
            data: {
                id: req.user.id,
                email: req.user.email,
                activeClass: req.user.activeClass,
                digipogs: digipogs,
                pogMeter: req.user.pogMeter,
                displayName: req.user.displayName,
                permissions: req.user.permissions,
                classId: req.user.classId,
                classPermissions: req.user.classPermissions,
            },
        });
    });
};
