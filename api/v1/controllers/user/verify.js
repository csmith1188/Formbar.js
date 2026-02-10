const { dbRun, dbGetAll } = require("@modules/database");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("@middleware/permission-check");
const { isAuthenticated } = require("@middleware/authentication");
const jwt = require("jsonwebtoken");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    const verifyUserHandler = async (req, res) => {
        const id = req.params.id;
        const tempUsers = await dbGetAll("SELECT * FROM temp_user_creation_data");
        let tempUser;
        for (const user of tempUsers) {
            const userData = jwt.decode(user.token);
            if (userData.newSecret == id) {
                tempUser = userData;
                break;
            }
        }

        if (!tempUser) {
            throw new NotFoundError("Pending user not found");
        }

        await dbRun("INSERT INTO users (email, password, permissions, API, secret, displayName, verified) VALUES (?, ?, ?, ?, ?, ?, ?)", [
            tempUser.email,
            tempUser.hashedPassword,
            tempUser.permissions,
            tempUser.newAPI,
            tempUser.newSecret,
            tempUser.displayName,
            1,
        ]);
        await dbRun("DELETE FROM temp_user_creation_data WHERE secret=?", [tempUser.newSecret]);
        res.status(200).json({
            success: true,
            data: {
                ok: true,
            },
        });
    };

    /**
     * @swagger
     * /api/v1/user/{id}/verify:
     *   patch:
     *     summary: Verify a pending user
     *     tags:
     *       - Users
     *     description: Verifies and activates a pending user account (requires manager permissions)
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Pending user's temporary ID
     *     responses:
     *       200:
     *         description: User verified successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *                   example: true
     *       403:
     *         description: Insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       404:
     *         description: Pending user not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     */
    router.patch("/user/:id/verify", isAuthenticated, hasPermission(MANAGER_PERMISSIONS), verifyUserHandler);

    // Deprecated endpoint - kept for backwards compatibility, use PATCH /api/v1/user/:id/verify instead
    router.post("/user/:id/verify", isAuthenticated, hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        res.setHeader("X-Deprecated", "Use PATCH /api/v1/user/:id/verify instead");
        res.setHeader(
            "Warning",
            '299 - "Deprecated API: Use PATCH /api/v1/user/:id/verify instead. This endpoint will be removed in a future version."'
        );
        await verifyUserHandler(req, res);
    });
};
