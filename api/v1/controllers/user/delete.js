const { logger } = require("@modules/logger");
const { deleteUser } = require("@modules/user/userSession");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("../middleware/permission-check");

module.exports = (router) => {
    try {
        /**
         * @swagger
         * /api/v1/user/{id}/delete:
         *   get:
         *     summary: Delete a user
         *     tags:
         *       - Users
         *     description: Permanently deletes a user from Formbar. Requires manager permissions.
         *     parameters:
         *       - in: path
         *         name: id
         *         required: true
         *         description: The ID of the user to delete
         *         schema:
         *           type: string
         *           example: "1"
         *     responses:
         *       200:
         *         description: User deleted successfully
         *       500:
         *         description: Server error
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ServerError'
         */
        // Deletes a user from Formbar
        router.get("/user/:id/delete", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
            try {
                const userId = req.params.id;
                const result = await deleteUser(userId);
                if (result === true) {
                    res.status(200);
                } else {
                    res.status(500).json({ error: result });
                }
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
