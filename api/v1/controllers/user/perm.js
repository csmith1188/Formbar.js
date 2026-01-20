const { classInformation } = require("@modules/class/classroom");
const { logger } = require("@modules/logger");
const { dbRun } = require("@modules/database");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("../middleware/permission-check");

module.exports = (router) => {
    try {
        /**
         * @swagger
         * /api/v1/user/{email}/perm:
         *   post:
         *     summary: Change user's global permissions
         *     tags:
         *       - Users
         *     description: Updates a user's global permission level. Requires manager permissions.
         *     parameters:
         *       - in: path
         *         name: email
         *         required: true
         *         description: The email of the user to update
         *         schema:
         *           type: string
         *           example: "user@example.com"
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               perm:
         *                 type: number
         *                 description: The new permission level
         *                 example: 2
         *     responses:
         *       200:
         *         description: Permission updated successfully
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 ok:
         *                   type: boolean
         *       400:
         *         description: Invalid permission value
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
        // Change a user's global permissions
        router.post("/user/:email/perm", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
            try {
                const email = req.params.email;
                let { perm } = req.body || {};
                perm = Number(perm);
                if (!Number.isFinite(perm)) return res.status(400).json({ error: "Invalid permission value" });

                await dbRun("UPDATE users SET permissions=? WHERE email=?", [perm, email]);
                if (classInformation.users[email]) {
                    classInformation.users[email].permissions = perm;
                }

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
