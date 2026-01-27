const { deleteUser } = require("@modules/user/userSession");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("@modules/middleware/permission-check");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/user/{id}/delete:
     *   get:
     *     summary: Delete a user
     *     tags:
     *       - Users
     *     description: Deletes a user from Formbar (requires manager permissions)
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: User ID
     *     responses:
     *       200:
     *         description: User deleted successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       403:
     *         description: Insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       500:
     *         description: Delete operation failed
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.get("/user/:id/delete", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        const userId = req.params.id;
        const result = await deleteUser(userId);
        if (result === true) {
            res.status(200).json({ success: true });
        } else {
            throw new AppError(result);
        }
    });
};
