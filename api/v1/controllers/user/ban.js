const { hasPermission } = require("@modules/middleware/permission-check");
const { dbGet, dbRun } = require("@modules/database");
const { MANAGER_PERMISSIONS, BANNED_PERMISSIONS, STUDENT_PERMISSIONS } = require("@modules/permissions");
const { classInformation } = require("@modules/class/classroom");
const { managerUpdate } = require("@modules/socketUpdates");

module.exports = (router) => {
    const banUserHandler = async (req, res) => {
        const userId = req.params.id;
        const user = await dbGet(`SELECT * FROM users WHERE id = ?`, [userId]);
        if (!user) {
            throw new NotFoundError("User not found");
        }

        await dbRun("UPDATE users SET permissions=? WHERE id=?", [BANNED_PERMISSIONS, userId]);
        if (classInformation.users[user.email]) {
            classInformation.users[user.email].permissions = BANNED_PERMISSIONS;
        }

        managerUpdate();
        res.status(200).json({ ok: true });
    };

    const unbanUserHandler = async (req, res) => {
        const userId = req.params.id;
        const user = await dbGet(`SELECT * FROM users WHERE id = ?`, [userId]);
        if (!user) {
            throw new NotFoundError("User not found");
        }

        await dbRun("UPDATE users SET permissions=? WHERE id=?", [STUDENT_PERMISSIONS, userId]);
        if (classInformation.users[user.email]) {
            classInformation.users[user.email].permissions = STUDENT_PERMISSIONS;
        }

        managerUpdate();
        res.status(200).json({ ok: true });
    };

    /**
     * @swagger
     * /api/v1/user/{id}/ban:
     *   patch:
     *     summary: Ban a user globally
     *     tags:
     *       - Users
     *     description: Globally bans a user by setting their permissions to 0. Requires manager permissions.
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
    router.patch("/user/:id/ban", hasPermission(MANAGER_PERMISSIONS), banUserHandler);

    /**
     * @swagger
     * /api/v1/user/{id}/ban:
     *   get:
     *     summary: Ban a user globally (DEPRECATED)
     *     deprecated: true
     *     tags:
     *       - Users
     *     description: |
     *       **DEPRECATED**: Use `PATCH /api/v1/user/{id}/ban` instead.
     *
     *       This endpoint will be removed in a future version. Globally bans a user by setting their permissions to 0.
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
    router.get("/user/:id/ban", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        res.setHeader("X-Deprecated", "Use PATCH /api/v1/user/:id/ban instead");
        res.setHeader("Warning", '299 - "Deprecated API: Use PATCH /api/v1/user/:id/ban instead. This endpoint will be removed in a future version."');
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
    router.patch("/user/:id/unban", hasPermission(MANAGER_PERMISSIONS), unbanUserHandler);

    /**
     * @swagger
     * /api/v1/user/{id}/unban:
     *   get:
     *     summary: Unban a user globally (DEPRECATED)
     *     deprecated: true
     *     tags:
     *       - Users
     *     description: |
     *       **DEPRECATED**: Use `PATCH /api/v1/user/{id}/unban` instead.
     *
     *       This endpoint will be removed in a future version. Globally unbans a user by restoring their permissions to student level. Requires manager permissions.
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
    router.get("/user/:id/unban", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        res.setHeader("X-Deprecated", "Use PATCH /api/v1/user/:id/unban instead");
        res.setHeader("Warning", '299 - "Deprecated API: Use PATCH /api/v1/user/:id/unban instead. This endpoint will be removed in a future version."');
        await unbanUserHandler(req, res);
    });
};
