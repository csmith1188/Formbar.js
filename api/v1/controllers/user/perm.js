const { classInformation } = require("@modules/class/classroom");
const { dbRun } = require("@modules/database");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("@middleware/permission-check");
const { isAuthenticated } = require("@middleware/authentication");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    const updatePermissionsHandler = async (req, res) => {
        const email = req.params.email;
        let { perm } = req.body || {};
        perm = Number(perm);
        if (!Number.isFinite(perm)) {
            throw new ValidationError("Invalid permission value");
        }

        await dbRun("UPDATE users SET permissions=? WHERE email=?", [perm, email]);
        if (classInformation.users[email]) {
            classInformation.users[email].permissions = perm;
        }

        res.status(200).json({
            success: true,
            data: {
                ok: true,
            },
        });
    };

    /**
     * @swagger
     * /api/v1/user/{email}/perm:
     *   patch:
     *     summary: Change user's global permissions
     *     tags:
     *       - Users
     *     description: Updates a user's global permission level (requires manager permissions)
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: email
     *         required: true
     *         schema:
     *           type: string
     *         description: User email
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - perm
     *             properties:
     *               perm:
     *                 type: integer
     *                 example: 3
     *                 description: New permission level
     *     responses:
     *       200:
     *         description: Permissions updated successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *                   example: true
     *       400:
     *         description: Invalid permission value
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       403:
     *         description: Insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.patch("/user/:email/perm", isAuthenticated, hasPermission(MANAGER_PERMISSIONS), updatePermissionsHandler);

    // Deprecated endpoint - kept for backwards compatibility, use PATCH /api/v1/user/:email/perm instead
    router.post("/user/:email/perm", isAuthenticated, hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        res.setHeader("X-Deprecated", "Use PATCH /api/v1/user/:email/perm instead");
        res.setHeader(
            "Warning",
            '299 - "Deprecated API: Use PATCH /api/v1/user/:email/perm instead. This endpoint will be removed in a future version."'
        );
        await updatePermissionsHandler(req, res);
    });
};
