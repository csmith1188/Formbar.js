const { dbGetAll, dbRun } = require("../../../modules/database");

module.exports = {
    async run(database) {
        const columns = await dbGetAll("PRAGMA table_info(digipog_pool_users)", [], database);
        const memberColumn = columns.find((column) => column.name === "member");
        if (memberColumn) {
            // Use a transaction so the migration is atomic
            await dbRun("BEGIN TRANSACTION", [], database);
            try {
                // Create a new temporary table with the restructured format
                await dbRun(
                    `CREATE TABLE IF NOT EXISTS digipog_pool_users_temp (
                    "pool_id"   INTEGER NOT NULL,
                    "user_id"   INTEGER NOT NULL,
                    "owner"     INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY ("pool_id", "user_id")
                );`,
                    [],
                    database
                );

                const rows = await dbGetAll("SELECT id, owner, member FROM digipog_pool_users", [], database);
                // Migrate the data from the old table to the new temporary table
                // For each row, split the owner and member columns by comma and insert individual entries to align with the new structure
                for (const row of rows) {
                    const userId = row.id;
                    // Helper to process a comma-separated list (ownerFlag = 1 for owners, 0 for members)
                    const processList = async (list, ownerFlag) => {
                        if (!list) return;
                        for (const rawPoolId of list.split(",")) {
                            const poolIdStr = String(rawPoolId || "").trim();
                            if (!poolIdStr) continue;
                            const poolId = parseInt(poolIdStr, 10);
                            if (Number.isNaN(poolId)) continue;
                            await dbRun(
                                "INSERT INTO digipog_pool_users_temp (pool_id, user_id, owner) VALUES (?, ?, ?)",
                                [poolId, userId, ownerFlag],
                                database
                            );
                        }
                    };

                    // Process both owner and member lists (both may exist)
                    await processList(row.owner, 1);
                    await processList(row.member, 0);
                }

                // Drop the old digipog_pool_users table
                await dbRun("DROP TABLE IF EXISTS digipog_pool_users", [], database);
                // Rename the temporary table to digipog_pool_users
                await dbRun("ALTER TABLE digipog_pool_users_temp RENAME TO digipog_pool_users", [], database);

                await dbRun("COMMIT", [], database);
            } catch (err) {
                await dbRun("ROLLBACK", [], database);
                throw err;
            }
        }
    },
};
