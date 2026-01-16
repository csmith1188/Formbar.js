const { dbGetAll } = require("@modules/database");

async function getUserTransactions(userId) {
    const transactions = await dbGetAll("SELECT * FROM transactions WHERE from_user = ? OR to_user = ? ORDER BY date DESC", [userId, userId]);
    return transactions;
}

module.exports = {
    getUserTransactions,
};
