const { dbGetAll } = require("@modules/database");

async function getUserTransactions(userId) {
    const pools = await dbGetAll("SELECT pool_id FROM digipog_pool_users WHERE user_id = ?", [userId]);
    const poolIds = pools.map(pool => pool.pool_id);

    // Build the query dynamically based on whether there are pools
    let query = "SELECT * FROM transactions WHERE (from_id = ? AND from_type = 'user') OR (to_id = ? AND to_type = 'user')";
    let params = [userId, userId];
    
    if (poolIds.length > 0) {
        const placeholders = poolIds.map(() => '?').join(',');
        query += ` OR (from_id IN (${placeholders}) AND from_type = 'pool') OR (to_id IN (${placeholders}) AND to_type = 'pool')`;
        params.push(...poolIds, ...poolIds);
    }
    
    query += " ORDER BY date DESC";
    
    const transactions = await dbGetAll(query, params);
    return transactions;
}

module.exports = {
    getUserTransactions,
};