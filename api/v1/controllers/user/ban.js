const { logger } = require("@modules/logger");
const { hasPermission } = require("../middleware/permission-check");
const { dbGet, dbRun } = require("@modules/database");
const { MANAGER_PERMISSIONS, BANNED_PERMISSIONS, STUDENT_PERMISSIONS } = require("@modules/permissions");
const { classInformation } = require("@modules/class/classroom");
const { managerUpdate } = require("@modules/socketUpdates");

module.exports = (router) => {
    try {
        /**
         * @swagger
         * /api/v1/user/{id}/ban:
         *   get:
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
        // Globally ban a user (set permissions to 0)
        router.get("/user/:id/ban", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
            try {
                const userId = req.params.id;
                const user = await dbGet(`SELECT * FROM users WHERE id = ?`, [userId]);
                if (!user) return res.status(404).json({ error: "User not found" });

                await dbRun("UPDATE users SET permissions=? WHERE id=?", [BANNED_PERMISSIONS, userId]);
                if (classInformation.users[user.email]) {
                    classInformation.users[user.email].permissions = BANNED_PERMISSIONS;
                }

                managerUpdate();
                res.status(200).json({ ok: true });
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });

        /**
         * @swagger
         * /api/v1/user/{id}/unban:
         *   get:
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
        // Globally unban a user
        router.get("/user/:id/unban", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
            try {
                const userId = req.params.id;
                const user = await dbGet(`SELECT * FROM users WHERE id = ?`, [userId]);
                if (!user) return res.status(404).json({ error: "User not found" });

                await dbRun("UPDATE users SET permissions=? WHERE id=?", [STUDENT_PERMISSIONS, userId]);
                if (classInformation.users[user.email]) {
                    classInformation.users[user.email].permissions = STUDENT_PERMISSIONS;
                }

                managerUpdate();
                res.status(200).json({ ok: true });
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
