const { isVerified, permCheck, isAuthenticated } = require("@middleware/authentication");
const { classInformation } = require("@modules/class/classroom");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { getUserData } = require("@services/user-service");
const { getUserTransactions } = require("@services/digipog-service");
const ForbiddenError = require("@errors/forbidden-error");
const NotFoundError = require("@errors/not-found-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/profile/transactions/{userId}:
     *   get:
     *     summary: Get user transaction history
     *     tags:
     *       - Profile
     *     description: Returns the transaction history for a user. Users can view their own transactions, or managers can view any user's transactions.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: userId
     *         required: false
     *         description: The ID of the user to retrieve transactions for (defaults to current user)
     *         schema:
     *           type: string
     *           example: "1"
     *     responses:
     *       200:
     *         description: Transactions retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 transactions:
     *                   type: array
     *                   items:
     *                     type: object
     *                 displayName:
     *                   type: string
     *                 currentUserId:
     *                   type: string
     *       403:
     *         description: Forbidden - insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
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
    router.get("/profile/transactions/:userId?", isAuthenticated, isVerified, permCheck, async (req, res) => {
        // Log the request information
        req.infoEvent("profile.transactions.view", "Viewing transactions", { targetUserId: req.params.userId });

        // Check if the user has permission to view these transactions (either their own or they are a manager)
        const userId = req.params.userId || req.user.userId;
        if (req.user.userId !== userId && req.user.permissions < MANAGER_PERMISSIONS) {
            throw new ForbiddenError("You do not have permission to view these transactions.");
        }

        const userData = await getUserData(userId);
        if (!userData) {
            throw new NotFoundError("User not found.", { event: "profile.user_not_found", reason: "user_not_in_database" });
        }

        const userDisplayName = userData.displayName || "Unknown User";
        const transactions = await getUserTransactions(userId);

        // Handle case where no transactions are found
        if (!transactions || transactions.length === 0) {
            req.infoEvent("profile.transactions.empty", "No transactions found for user", { userId });
            // Still render the page, just with an empty array
            res.status(200).json({
                success: true,
                data: {
                    transactions: [],
                    displayName: userDisplayName,
                    currentUserId: req.user.userId,
                },
            });
            return;
        }

        res.status(200).json({
            success: true,
            data: {
                transactions: transactions,
                displayName: userDisplayName,
                currentUserId: req.user.userId,
            },
        });
    });

    /**
     * @swagger
     * /api/v1/profile/{userId}:
     *   get:
     *     summary: Get user profile information
     *     tags:
     *       - Profile
     *     description: Returns detailed profile information for a user including digipogs, API status, and PIN status. Email visibility depends on permissions.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: userId
     *         required: false
     *         description: The ID of the user to retrieve (defaults to current user)
     *         schema:
     *           type: string
     *           example: "1"
     *     responses:
     *       200:
     *         description: Profile retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 displayName:
     *                   type: string
     *                 email:
     *                   type: string
     *                   description: Hidden if viewer lacks permissions
     *                 digipogs:
     *                   type: integer
     *                 id:
     *                   type: string
     *                 API:
     *                   type: string
     *                   nullable: true
     *                 pin:
     *                   type: string
     *                   nullable: true
     *                 pogMeter:
     *                   type: integer
     *                 isOwnProfile:
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
    router.get("/profile/:userId?", isAuthenticated, isVerified, permCheck, async (req, res) => {
        // Log the request information
        req.infoEvent("profile.view", `Viewing profile`, { user: req.user?.email, ip: req.ip, targetUserId: req.params.userId });

        // Check if userData is null or undefined
        const userId = req.params.userId || req.user.userId;
        const userData = await getUserData(userId);
        if (!userData) {
            req.warnEvent("profile.user_not_found", `User not found in database: userId=${userId}`, { userId });
            throw new NotFoundError("User not found.");
        }

        // Destructure userData and validate required fields
        const { id, displayName, email, digipogs, API, pin } = userData;
        if (!id || !displayName || !email || digipogs === undefined || !API) {
            throw new AppError("Unable to retrieve profile information. Please try again.", { event: "profile.incomplete_data", reason: "missing_required_fields" });
        }

        // Determine if the email should be visible then render the page
        const emailVisible = req.user.userId === id || classInformation.users[req.user.email]?.permissions >= MANAGER_PERMISSIONS;
        const isOwnProfile = req.user.userId === userId;

        res.status(200).json({
            success: true,
            data: {
                displayName: displayName,
                email: emailVisible ? email : "Hidden", // Hide email if the user is not the owner of the profile and is not a manager
                digipogs: digipogs,
                id: userId,
                API: isOwnProfile ? "Exists" : null,
                pin: isOwnProfile ? (pin ? "Exists" : null) : "Hidden",
                pogMeter: classInformation.users[email] ? classInformation.users[email].pogMeter : 0,
                isOwnProfile: isOwnProfile,
            },
        });
    });
};
