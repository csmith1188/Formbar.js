const { isVerified, permCheck } = require("@controllers/middleware/authentication");
const { logger } = require("@modules/logger");
const { logNumbers } = require("@modules/config");
const { classInformation } = require("@modules/class/classroom");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { getUserData } = require("@services/user-service");
const { getUserTransactions } = require("@services/digipog-service");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/profile/transactions/{userId}:
     *   get:
     *     summary: Get user transaction history
     *     tags:
     *       - Profile
     *     description: Returns the transaction history for a user. Users can view their own transactions, or managers can view any user's transactions.
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
    router.get("/profile/transactions/:userId?", isVerified, permCheck, async (req, res) => {
        try {
            // Log the request information
            logger.log("info", `[get /profile/transactions] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

            // Check if the user has permission to view these transactions (either their own or they are a manager)
            const userId = req.params.userId || req.session.userId;
            if (req.session.userId !== userId && req.session.permissions < MANAGER_PERMISSIONS) {
                return res.status(403).json({ error: "You do not have permission to view these transactions." });
            }

            const userData = await getUserData(userId);
            if (!userData) {
                logger.log("warn", `User not found: userId=${userId}`);
                return res.status(404).json({ error: "User not found." });
            }

            const userDisplayName = userData.displayName || "Unknown User";
            const transactions = await getUserTransactions(userId);

            // Handle case where no transactions are found
            if (!transactions || transactions.length === 0) {
                logger.log("info", "No transactions found for user");
                // Still render the page, just with an empty array
                res.status(200).json({
                    transactions: [],
                    displayName: userDisplayName,
                    currentUserId: req.session.userId,
                });
                return;
            }

            res.status(200).json({
                transactions: transactions,
                displayName: userDisplayName,
                currentUserId: req.session.userId,
            });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: `There was a server error. Please try again.` });
        }
    });

    /**
     * @swagger
     * /api/v1/profile/{userId}:
     *   get:
     *     summary: Get user profile information
     *     tags:
     *       - Profile
     *     description: Returns detailed profile information for a user including digipogs, API status, and PIN status. Email visibility depends on permissions.
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
    router.get("/profile/:userId?", isVerified, permCheck, async (req, res) => {
        try {
            // Log the request information
            logger.log("info", `[get /profile] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

            // Check if userData is null or undefined
            const userId = req.params.userId || req.session.userId;
            const userData = await getUserData(userId);
            if (!userData) {
                logger.log("warn", `User not found in database: userId=${userId}`);
                return res.status(404).json({ error: "User not found." });
            }

            // Destructure userData and validate required fields
            const { id, displayName, email, digipogs, API, pin } = userData;
            if (!id || !displayName || !email || digipogs === undefined || !API) {
                logger.log("error", `Incomplete user data retrieved from database: userId=${userId}, fields missing`);
                return res.status(500).json({ error: "Unable to retrieve profile information. Please try again." });
            }

            // Determine if the email should be visible then render the page
            const emailVisible = req.session.userId === id || classInformation.users[req.session.email].permissions >= MANAGER_PERMISSIONS;
            const isOwnProfile = req.session.userId === userId;

            res.status(200).json({
                displayName: displayName,
                email: emailVisible ? email : "Hidden", // Hide email if the user is not the owner of the profile and is not a manager
                digipogs: digipogs,
                id: userId,
                API: isOwnProfile ? "Exists" : null,
                pin: isOwnProfile ? (pin ? "Exists" : null) : "Hidden",
                pogMeter: classInformation.users[email] ? classInformation.users[email].pogMeter : 0,
                isOwnProfile: isOwnProfile,
            });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "Unable to retrieve profile information. Please try again." });
        }
    });
};
