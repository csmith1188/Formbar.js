const { dbRun, dbGetAll } = require("@modules/database");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("@modules/middleware/permission-check");
const jwt = require("jsonwebtoken");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/user/{id}/verify:
     *   post:
     *     summary: Verify a pending user
     *     tags:
     *       - Users
     *     description: Verifies and activates a pending user account (requires manager permissions)
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
    router.post("/user/:id/verify", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
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
        res.status(200).json({ ok: true });
    });
};
