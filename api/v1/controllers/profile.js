const { isVerified, permCheck } = require("@modules/middleware/authentication");
const { logger } = require("@modules/logger");
const { classInformation } = require("@modules/class/classroom");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { getUserData } = require("@services/user-service");
const { getUserTransactions } = require("@services/digipog-service");
const ForbiddenError = require("@errors/forbidden-error");
const NotFoundError = require("@errors/not-found-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    router.get("/profile/transactions/:userId?", isVerified, permCheck, async (req, res) => {
        // Log the request information
        logger.log("info", `[get /profile/transactions] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

        // Check if the user has permission to view these transactions (either their own or they are a manager)
        const userId = req.params.userId || req.session.userId;
        if (req.session.userId !== userId && req.session.permissions < MANAGER_PERMISSIONS) {
            throw new ForbiddenError("You do not have permission to view these transactions.");
        }

        const userData = await getUserData(userId);
        if (!userData) {
            logger.log("warn", `User not found: userId=${userId}`);
            throw new NotFoundError("User not found.");
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
    });

    router.get("/profile/:userId?", isVerified, permCheck, async (req, res) => {
        // Log the request information
        logger.log("info", `[get /profile] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

        // Check if userData is null or undefined
        const userId = req.params.userId || req.session.userId;
        const userData = await getUserData(userId);
        if (!userData) {
            logger.log("warn", `User not found in database: userId=${userId}`);
            throw new NotFoundError("User not found.");
        }

        // Destructure userData and validate required fields
        const { id, displayName, email, digipogs, API, pin } = userData;
        if (!id || !displayName || !email || digipogs === undefined || !API) {
            logger.log("error", `Incomplete user data retrieved from database: userId=${userId}, fields missing`);
            throw new AppError("Unable to retrieve profile information. Please try again.");
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
    });
};
