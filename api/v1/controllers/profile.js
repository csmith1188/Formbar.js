const { isAuthenticated, isVerified, permCheck } = require("@controllers/middleware/authentication");
const { logger } = require("@modules/logger");
const { logNumbers } = require("@modules/config");
const { classInformation } = require("@modules/class/classroom");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { getUserData } = require("@services/user-service");
const { getUserTransactions } = require("@services/digipog-service");

module.exports = (router) => {
    router.get("/profile/transactions/:userId?", isVerified, permCheck, async (req, res) => {
        try {
            // Log the request information
            logger.log("info", `[get /profile/transactions] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

            // Check if the user has permission to view these transactions (either their own or they are a manager)
            const userId = req.params.userId || req.session.userId;
            if (req.session.userId !== userId && req.session.permissions < MANAGER_PERMISSIONS) {
                throw new Error("You do not have permission to view these transactions.");
            }

            const userData = await getUserData(userId);
            const userDisplayName = userData?.displayName || "Unknown User";
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
            res.status(500).json({ error: `Error Number ${logNumbers.error}: There was a server error try again.` });
        }
    });

    router.get("/profile/:userId?", isVerified, permCheck, async (req, res) => {
        try {
            // Log the request information
            logger.log("info", `[get /profile] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

            // Check if userData is null or undefined
            const userId = req.params.userId || req.session.userId;
            const userData = await getUserData(userId);
            if (!userData) {
                logger.log("error", "User data not found in database");
                throw new Error("User not found");
            }

            // Destructure userData and validate required fields
            const { id, displayName, email, digipogs, API, pin } = userData;
            if (!id || !displayName || !email || digipogs === undefined || !API) {
                logger.log("error", "Incomplete user data retrieved from database");
                throw new Error(`There was a server error try again.`);
            }

            // Determine if the email should be visible then render the page
            const emailVisible = req.session.userId == id || classInformation.users[req.session.email].permissions >= MANAGER_PERMISSIONS;
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
            res.status(500).json({ error: `Failed to retrieve profile: ${err.message}` });
        }
    });
};
