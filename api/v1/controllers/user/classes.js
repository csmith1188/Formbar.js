const { dbGet } = require("@modules/database");
const { getUserOwnedClasses } = require("@modules/user/user");
const { getUserJoinedClasses } = require("@services/class-service");
const { httpPermCheck } = require("@middleware/permission-check");
const { isAuthenticated } = require("@middleware/authentication");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/user/{id}/classes:
     *   get:
     *     summary: Get all classes associated with a user
     *     tags:
     *       - Users
     *     description: Returns a list of all classes the user is associated with (owned or joined), with each class indicating whether the user is the owner
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
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
     *         description: List of classes retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       id:
     *                         type: number
     *                       name:
     *                         type: string
     *                       key:
     *                         type: string
     *                       owner:
     *                         type: number
     *                       isOwner:
     *                         type: boolean
     *                       permissions:
     *                         type: number
     *       404:
     *         description: User not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     */
    router.get("/user/:id/classes", isAuthenticated, httpPermCheck("getOwnedClasses"), async (req, res) => {
        const userId = req.params.id;
        req.infoEvent("user.classes.view.attempt", "Attempting to view user classes", { targetUserId: userId });
        const user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
        if (!user) {
            throw new NotFoundError("User not found");
        }

        // Get owned classes
        const ownedClasses = await getUserOwnedClasses(user.email, req.user);

        // Get joined classes (with permissions != 0)
        let joinedClasses = await getUserJoinedClasses(userId);
        joinedClasses = joinedClasses.filter((classroom) => classroom.permissions !== 0);

        // Create a map to track classes and combine data
        const classesMap = new Map();

        // Add owned classes first (these are definitely owned)
        for (const ownedClass of ownedClasses) {
            classesMap.set(ownedClass.id, {
                id: ownedClass.id,
                name: ownedClass.name,
                key: ownedClass.key,
                owner: ownedClass.owner,
                isOwner: true,
                permissions: 5, // Owner permissions
                tags: ownedClass.tags,
            });
        }

        // Add joined classes (mark as not owned unless already in map as owned)
        for (const joinedClass of joinedClasses) {
            if (!classesMap.has(joinedClass.id)) {
                classesMap.set(joinedClass.id, {
                    id: joinedClass.id,
                    name: joinedClass.name,
                    isOwner: false,
                    permissions: joinedClass.permissions,
                });
            }
        }

        // Convert map to array
        const allClasses = Array.from(classesMap.values());

        req.infoEvent("user.classes.view.success", "User classes returned", { targetUserId: userId, classCount: allClasses.length });
        res.status(200).json({
            success: true,
            data: allClasses,
        });
    });
};
