const { logger } = require("@modules/logger");
const { dbRun, dbGetAll } = require("@modules/database");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("../middleware/permission-check");
const jwt = require("jsonwebtoken");

module.exports = (router) => {
    try {
        /**
         * @swagger
         * /api/v1/user/{id}/verify:
         *   post:
         *     summary: Verify a pending user
         *     tags:
         *       - Users
         *     description: Verifies a pending user and moves them from temp_user_creation_data to the users table. Requires manager permissions.
         *     parameters:
         *       - in: path
         *         name: id
         *         required: true
         *         description: The ID (secret) of the pending user to verify
         *         schema:
         *           type: string
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
         *       404:
         *         description: Pending user not found
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
        // Verify a pending user
        router.post("/user/:id/verify", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
            try {
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

                if (!tempUser) return res.status(404).json({ error: "Pending user not found" });

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
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: "There was a server error try again." });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
