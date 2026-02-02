const { dbGet } = require("@modules/database");
const { getUserOwnedClasses } = require("@modules/user/user");
const { httpPermCheck } = require("@modules/middleware/permission-check");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/user/{id}/classes:
     *   get:
     *     summary: Get user's owned classes
     *     tags:
     *       - Users
     *     description: Returns a list of classes owned by the specified user
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         description: The ID of the user
     *         schema:
     *           type: string
     *           example: "1"
     *     responses:
     *       200:
     *         description: List of owned classes retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 type: object
     *       404:
     *         description: User not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     */
    router.get("/user/:id/classes", httpPermCheck("getOwnedClasses"), async (req, res) => {
        const userId = req.params.id;
        const user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
        if (!user) {
            throw new NotFoundError("User not found");
        }

        const ownedClasses = await getUserOwnedClasses(user.email, req.user);
        res.status(200).json(ownedClasses);
    });
};
