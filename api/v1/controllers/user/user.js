const { classInformation } = require("@modules/class/classroom");
const { dbGet } = require("@modules/database");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/user/{id}:
     *   get:
     *     summary: Get user information by ID
     *     tags:
     *       - Users
     *     description: |
     *       Returns basic information about a user. The user's email address is only
     *       included when the requester is the user themself or a manager. Other
     *       fields (permissions, digipogs, displayName, verified) are always returned
     *       when the user exists.
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         description: The ID of the user to retrieve
     *         schema:
     *           type: string
     *           example: "1"
     *     responses:
     *       200:
     *         description: User information returned successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/User'
     *       401:
     *         description: Unauthorized (no session or insufficient permissions to view email)
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       404:
     *         description: User not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     */
    router.get("/user/:id", async (req, res) => {
        const userId = req.params.id;
        req.infoEvent("user.view.attempt", "Attempting to view user by id", { targetUserId: userId });

        // Check if the user is already logged in, and if they're not
        // then load them from the database.
        let user = Object.values(classInformation.users).find((user) => user.id == userId);
        if (!user) {
            user = await dbGet("SELECT * FROM users WHERE id=?", userId);
        } else {
            // Load missing digipogs and verified values from the database
            const { digipogs, verified } = (await dbGet("SELECT digipogs, verified FROM users WHERE id=?", userId)) || {};
            user.digipogs = digipogs;
            user.verified = verified;
        }

        // Only include the email if the requester is the user themselves or a manager
        const requesterEmail = req.user?.email;
        let userEmail = undefined;
        // Safer check for manager permissions
        const isManager = requesterEmail && classInformation.users[requesterEmail]?.permissions === MANAGER_PERMISSIONS;
        if (user && (requesterEmail === user.email || isManager)) {
            userEmail = user.email;
        }

        if (user) {
            req.infoEvent("user.view.success", "User data returned", { targetUserId: userId });
            res.status(200).json({
                success: true,
                data: {
                    id: user.id,
                    email: userEmail,
                    permissions: user.permissions,
                    digipogs: user.digipogs,
                    displayName: user.displayName,
                    verified: user.verified,
                },
            });
        } else {
            throw new NotFoundError("User not found.", { event: "user.get.failed", reason: "user_not_found" });
        }
    });
};
