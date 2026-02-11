const { hasPermission } = require("@middleware/permission-check");
const { isAuthenticated } = require("@middleware/authentication");
const { dbGet, dbRun } = require("@modules/database");
const { MANAGER_PERMISSIONS, BANNED_PERMISSIONS, STUDENT_PERMISSIONS } = require("@modules/permissions");
const { classInformation } = require("@modules/class/classroom");
const { managerUpdate } = require("@modules/socket-updates");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    const banUserHandler = async (req, res) => {
        const userId = req.params.id;
        req.infoEvent("user.ban.attempt", "Attempting to ban user", { userId });
        
        const user = await dbGet(`SELECT * FROM users WHERE id = ?`, [userId]);
        if (!user) {
            throw new NotFoundError("User not found", { event: "user.ban.failed", reason: "user_not_found" });
        }

        await dbRun("UPDATE users SET permissions=? WHERE id=?", [BANNED_PERMISSIONS, userId]);
        if (classInformation.users[user.email]) {
            classInformation.users[user.email].permissions = BANNED_PERMISSIONS;
        }

        await managerUpdate();
        
        req.infoEvent("user.ban.success", "User banned successfully", { userId, userEmail: user.email });
        res.status(200).json({
            success: true,
            data: {
                ok: true,
            },
        });
    };

    const unbanUserHandler = async (req, res) => {
        const userId = req.params.id;
        req.infoEvent("user.unban.attempt", "Attempting to unban user", { userId });
        
        const user = await dbGet(`SELECT * FROM users WHERE id = ?`, [userId]);
        if (!user) {
            throw new NotFoundError("User not found", { event: "user.unban.failed", reason: "user_not_found" });
        }

        await dbRun("UPDATE users SET permissions=? WHERE id=?", [STUDENT_PERMISSIONS, userId]);
        if (classInformation.users[user.email]) {
            classInformation.users[user.email].permissions = STUDENT_PERMISSIONS;
        }

        await managerUpdate();
        
        req.infoEvent("user.unban.success", "User unbanned successfully", { userId, userEmail: user.email });
        res.status(200).json({
            success: true,
            data: {
                ok: true,
            },
        });
    };

    /**
     * @swagger
     * /api/v1/user/{id}/ban:
     *   patch:
     *     summary: Ban a user globally
     *     tags:
     *       - Users
     *     description: Globally bans a user by setting their permissions to 0. Requires manager permissions.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         description: The ID of the user to ban
     *         schema:
     *           type: string
     *           example: "1"
     *     responses:
     *       200:
     *         description: User banned successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *       404:
     *         description: User not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.patch("/user/:id/ban", isAuthenticated, hasPermission(MANAGER_PERMISSIONS), banUserHandler);

    // Deprecated endpoint - kept for backwards compatibility, use PATCH /api/v1/user/:id/ban instead
    router.get("/user/:id/ban", isAuthenticated, hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        res.setHeader("X-Deprecated", "Use PATCH /api/v1/user/:id/ban instead");
        res.setHeader(
            "Warning",
            '299 - "Deprecated API: Use PATCH /api/v1/user/:id/ban instead. This endpoint will be removed in a future version."'
        );
        await banUserHandler(req, res);
    });

    /**
     * @swagger
     * /api/v1/user/{id}/unban:
     *   patch:
     *     summary: Unban a user globally
     *     tags:
     *       - Users
     *     description: Globally unbans a user by restoring their permissions to student level. Requires manager permissions.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         description: The ID of the user to unban
     *         schema:
     *           type: string
     *           example: "1"
     *     responses:
     *       200:
     *         description: User unbanned successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *       404:
     *         description: User not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.patch("/user/:id/unban", isAuthenticated, hasPermission(MANAGER_PERMISSIONS), unbanUserHandler);

    // Deprecated endpoint - kept for backwards compatibility, use PATCH /api/v1/user/:id/unban instead
    router.get("/user/:id/unban", isAuthenticated, hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        res.setHeader("X-Deprecated", "Use PATCH /api/v1/user/:id/unban instead");
        res.setHeader(
            "Warning",
            '299 - "Deprecated API: Use PATCH /api/v1/user/:id/unban instead. This endpoint will be removed in a future version."'
        );
        await unbanUserHandler(req, res);
    });
};
