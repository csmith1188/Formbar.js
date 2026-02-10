// 15_remove_invalid_pog_pools.js
// This migration removes pog pools that do not have an owner.

const { dbGetAll, dbRun } = require("@modules/database");
module.exports = {
    async run(database) {
        try {
            await dbRun("BEGIN TRANSACTION", [], database);

            // Get all pools and pool users
            const pools = await dbGetAll("SELECT * FROM digipog_pools");
            const poolUsers = await dbGetAll("SELECT * FROM digipog_pool_users");

            // Identify pool IDs that have at least one owner
            const validPoolIds = new Set(poolUsers.filter((poolUser) => poolUser.owner).map((poolUser) => poolUser.pool_id));
            const poolIds = new Set(pools.map((pool) => pool.id));

            for (const poolId of poolIds) {
                if (!validPoolIds.has(poolId)) {
                    const name = pools.find((pool) => pool.id === poolId).name;
                    console.log(`Removing invalid pool ${name} (id: ${poolId})`);
                    await dbRun("DELETE FROM digipog_pools WHERE id = ?", [poolId], database);
                }
            }

            await dbRun("COMMIT", [], database);
        } catch (err) {
            throw new Error("ALREADY_DONE");
        }
    },
};
