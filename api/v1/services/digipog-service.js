const { dbGetAll } = require("@modules/database");

async function getUserTransactions(userId) {
    const pools = await dbGetAll("SELECT pool_id FROM digipog_pool_users WHERE user_id = ?", [userId]);
    // Get the transactions from the database
    const transactions = await dbGetAll("SELECT * FROM transactions WHERE (from_id = ? AND from_type = 'user') OR (to_id = ? AND to_type = 'user') OR (from_id IN (?) AND from_type = 'pool') OR (to_id IN (?) AND to_type = 'pool') ORDER BY date DESC", [
        userId,
        userId,
        pools.map(p => p.pool_id),
        pools.map(p => p.pool_id),
    ]);
    return transactions;
}

module.exports = {
    getUserTransactions,
};
