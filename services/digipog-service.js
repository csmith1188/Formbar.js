const { dbGetAll } = require("@modules/database");

function getUserTransactions(userId) {
    return dbGetAll("SELECT * FROM transactions WHERE from_user = ? OR to_user = ? ORDER BY date DESC", [userId, userId]);
}

module.exports = {
    getUserTransactions,
};
