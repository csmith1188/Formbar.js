const { dbGetAll, dbGet, dbRun } = require("./database");

/*
  Helper module for digipog pool user operations using the new schema:
    digipog_pool_users(pool_id INTEGER, user_id INTEGER, owner INTEGER)
  Exported functions:
    - getPoolsForUser(userId, database)
    - getUsersForPool(poolId, database)
    - isUserInPool(userId, poolId, database)
    - isUserOwner(userId, poolId, database)
    - addUserToPool(poolId, userId, ownerFlag, database)
    - removeUserFromPool(poolId, userId, database)
    - setUserOwnerFlag(poolId, userId, ownerFlag, database)

  Usage:
    const pools = require("../modules/pools");
    await pools.addUserToPool(123, 456, 1, database);
    const users = await pools.getUsersForPool(123, database);

  NOTE: Replace any older code that queried "owner" or "member" CSV columns with calls to these helpers.
*/

async function getPoolsForUser(userId, database) {
    // Returns array of { pool_id, owner }
    return dbGetAll("SELECT pool_id, owner FROM digipog_pool_users WHERE user_id = ?", [userId], database);
}

async function getUsersForPool(poolId, database) {
    // Returns array of { user_id, owner }
    return dbGetAll("SELECT user_id, owner FROM digipog_pool_users WHERE pool_id = ?", [poolId], database);
}

async function isUserInPool(userId, poolId, database) {
    const row = await dbGet("SELECT 1 FROM digipog_pool_users WHERE pool_id = ? AND user_id = ? LIMIT 1", [poolId, userId], database);
    return !!row;
}

async function isUserOwner(userId, poolId, database) {
    const row = await dbGet("SELECT owner FROM digipog_pool_users WHERE pool_id = ? AND user_id = ? LIMIT 1", [poolId, userId], database);
    return !!(row && row.owner);
}

async function addUserToPool(poolId, userId, ownerFlag = 0, database) {
    // Insert or replace ensures the (pool_id, user_id) primary key constraint is respected and owner flag can be updated.
    // Using INSERT OR REPLACE will replace the row if it exists.
    return dbRun(
        "INSERT OR REPLACE INTO digipog_pool_users (pool_id, user_id, owner) VALUES (?, ?, ?)",
        [poolId, userId, ownerFlag ? 1 : 0],
        database
    );
}

async function removeUserFromPool(poolId, userId, database) {
    return dbRun("DELETE FROM digipog_pool_users WHERE pool_id = ? AND user_id = ?", [poolId, userId], database);
}

async function setUserOwnerFlag(poolId, userId, ownerFlag, database) {
    return dbRun("UPDATE digipog_pool_users SET owner = ? WHERE pool_id = ? AND user_id = ?", [ownerFlag ? 1 : 0, poolId, userId], database);
}

module.exports = {
    getPoolsForUser,
    getUsersForPool,
    isUserInPool,
    isUserOwner,
    addUserToPool,
    removeUserFromPool,
    setUserOwnerFlag
};
