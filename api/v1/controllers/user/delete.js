const { deleteUser } = require("@modules/user/user-session");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("@middleware/permission-check");
const { isAuthenticated } = require("@middleware/authentication");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    const deleteUserHandler = async (req, res) => {
        const userId = req.params.id;
        const result = await deleteUser(userId);
        if (result === true) {
            res.status(200).json({
                success: true,
                data: {},
            });
        } else {
            throw new AppError(result);
        }
    };

    /**
     * @swagger
     * /api/v1/user/{id}:
     *   delete:
     *     summary: Delete a user
     *     tags:
     *       - Users
     *     description: Deletes a user from Formbar (requires manager permissions)
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
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
    router.delete("/user/:id", isAuthenticated, hasPermission(MANAGER_PERMISSIONS), deleteUserHandler);

    // Deprecated endpoint - kept for backwards compatibility, use DELETE /api/v1/user/:id instead
    router.get("/user/:id/delete", isAuthenticated, hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        res.setHeader("X-Deprecated", "Use DELETE /api/v1/user/:id instead");
        res.setHeader("Warning", '299 - "Deprecated API: Use DELETE /api/v1/user/:id instead. This endpoint will be removed in a future version."');
        await deleteUserHandler(req, res);
    });
};
