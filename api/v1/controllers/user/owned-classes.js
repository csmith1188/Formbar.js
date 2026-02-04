const { dbGet } = require("@modules/database");
const { getUserOwnedClasses } = require("@modules/user/user");
const { httpPermCheck } = require("@modules/middleware/permission-check");
const { isAuthenticated } = require("@modules/middleware/authentication");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/user/{id}/ownedClasses:
     *   get:
     *     summary: Get user's owned classes
     *     tags:
     *       - Users
     *     description: Retrieves all classes owned by a specific user
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: User ID
     *     responses:
     *       200:
     *         description: Owned classes retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/ClassInfo'
     *       404:
     *         description: User not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     */
    router.get("/user/:id/ownedClasses", isAuthenticated, httpPermCheck("getOwnedClasses"), async (req, res) => {
        const userId = req.params.id;
        const user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
        if (!user) {
            throw new NotFoundError("User not found");
        }

        const ownedClasses = await getUserOwnedClasses(user.email, req.user);
        res.status(200).json(ownedClasses);
    });
};
