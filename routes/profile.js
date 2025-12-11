const { isVerified, permCheck } = require("./middleware/authentication");
const { dbGet, dbGetAll } = require("../modules/database");
const { logger } = require("../modules/logger");
const { logNumbers } = require("../modules/config");
const { classInformation } = require("../modules/class/classroom");
const { MANAGER_PERMISSIONS } = require("../modules/permissions");

module.exports = {
    run(app) {
        // Handle displaying people's transactions
        app.get("/profile/transactions/:userId?", isVerified, permCheck, async (req, res) => {
            try {
                // Log the request information
                logger.log("info", `[get /profile/transactions] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

                // Check if the user has permission to view these transactions (either their own or they are a manager)
                const userId = req.params.userId || req.session.userId;
                if (req.session.userId !== userId && req.session.permissions < MANAGER_PERMISSIONS) {
                    res.render("pages/message", {
                        message: "You do not have permission to view these transactions.",
                        title: "Error",
                    });
                    return;
                }

                // Get the transactions from the database
                const transactions = await dbGetAll("SELECT * FROM transactions WHERE from_user = ? OR to_user = ? ORDER BY date DESC", [
                    userId,
                    userId,
                ]);

				// Handle case where no transactions are found
                if (!transactions || transactions.length === 0) {
                    logger.log("info", "No transactions found for user");
                    // Still render the page, just with an empty array
                    const userDisplayName = (await dbGet("SELECT displayName FROM users WHERE id = ?", [userId]))?.displayName || "Unknown User";
                    res.render("pages/transactions", {
                        title: "Transactions",
                        transactions: [],
                        displayName: userDisplayName,
                        currentUserId: req.session.userId,
                    });
                    return;
                }

                // Get the user's display name
                const userDisplayName = (await dbGet("SELECT displayName FROM users WHERE id = ?", [userId]))?.displayName || "Unknown User";

                // Render the transactions page with the retrieved transactions
                res.render("pages/transactions", {
                    title: "Transactions",
                    transactions: transactions,
                    displayName: userDisplayName,
                    currentUserId: req.session.userId,
                });
            } catch (err) {
                logger.log("error", err.stack);
                res.render("pages/message", {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: "Error",
                });
            }
        });

        // Handle displaying the profile page
        app.get("/profile/:userId?", isVerified, permCheck, async (req, res) => {
            try {
                // Log the request information
                logger.log("info", `[get /profile] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

                // Check if userData is null or undefined
                const userId = req.params.userId || req.session.userId;
                const userData = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
                if (!userData) {
                    logger.log("error", "User data not found in database");
                    return res.render("pages/message", {
                        message: "Please enter a valid user ID.",
                        title: "Error",
                    });
                }

                // Destructure userData and validate required fields
                const { id, displayName, email, digipogs, API, pin } = userData;
                if (!id || !displayName || !email || digipogs === undefined || !API) {
                    logger.log("error", "Incomplete user data retrieved from database");
                    return res.render("pages/message", {
                        message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                        title: "Error",
                    });
                }

                // Determine if the email should be visible then render the page
                const emailVisible = req.session.userId == id || classInformation.users[req.session.email].permissions >= MANAGER_PERMISSIONS;
                const isOwnProfile = req.session.userId === userId;

                res.render("pages/profile", {
                    title: "Profile",
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
                res.render("pages/message", {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: "Error",
                });
            }
        });
    },
};
