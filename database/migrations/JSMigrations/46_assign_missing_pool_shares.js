// 46_assign_missing_pool_shares.js
// Creates share items and grants 100 shares to the owner of each pool missing one.

const { dbGetAll, dbRun } = require("@modules/database");

const SHARES_PER_POOL = 100;

module.exports = {
    /**
     * Backfill share items and owner inventory for pools without a share item.
     * @param {import("sqlite3").Database} database - Migration database connection.
     * @returns {Promise<void>}
     */
    async run(database) {
        const pools = await dbGetAll(
            `SELECT p.id, p.name,
                    (SELECT pu.user_id FROM digipog_pool_users pu WHERE pu.pool_id = p.id AND pu.owner = 1 ORDER BY pu.user_id LIMIT 1) AS owner_id
             FROM digipog_pools p
             WHERE p.share_item IS NULL`,
            [],
            database
        );

        if (pools.length === 0) return;

        await dbRun("BEGIN TRANSACTION", [], database);
        try {
            for (const pool of pools) {
                const shareItemId = await dbRun(
                    "INSERT INTO item_registry (name, description, stack_size, image_url) VALUES (?, ?, ?, ?)",
                    [`${pool.name} Share`, `Share of ${pool.name}`, SHARES_PER_POOL, null],
                    database
                );

                await dbRun("UPDATE digipog_pools SET share_item = ? WHERE id = ? AND share_item IS NULL", [shareItemId, pool.id], database);

                if (pool.owner_id !== null && pool.owner_id !== undefined) {
                    await dbRun("INSERT INTO inventory (user_id, item_id, quantity) VALUES (?, ?, ?)", [pool.owner_id, shareItemId, SHARES_PER_POOL], database);
                }
            }

            await dbRun("COMMIT", [], database);
        } catch (error) {
            await dbRun("ROLLBACK", [], database);
            throw error;
        }
    },
};
