import { dbGetAll, dbRun } from "../../../modules/database";

module.exports = {
    async run(database) {
        const columns = await dbGetAll("PRAGMA table_info(digipog_pool_users)", [], database);
        const memberColumn = columns.find((column) => column.name === "member");
        if (memberColumn) {
            // If the column exists, then this is a legacy digipog_pool_users table
            // Create a new temporary table with the restructured format
            await dbRun(`CREATE TABLE IF NOT EXISTS digipog_pool_users_temp (
                "pool_id"   INTEGER NOT NULL,
                "user_id"   INTEGER NOT NULL,
                "owner"     INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY ("pool_id", "user_id")
            );`, [] , database);

            const rows = await dbGetAll("SELECT id, owner, member FROM digipog_pool_users", [], database);
            // Migrate the data from the old table to the new temporary table
            // For each row, split the owner and member columns by comma and insert individual entries to align with the new structure
            for (const row of rows) {
                if (row.owner) {
                    for (const pool_id of row.owner.split(",")) {
                        await dbRun(
                            "INSERT INTO digipog_pool_users_temp (pool_id, user_id, owner) VALUES (?, ?, ?)",
                            [parseInt(pool_id), row.id, 1], database
                        );
                    }
                } else if (row.member) {
                    for (const pool_id of row.member.split(",")) {
                        await dbRun(
                            "INSERT INTO digipog_pool_users_temp (pool_id, user_id, owner) VALUES (?, ?, ?)",
                            [parseInt(pool_id), row.id, 0], database
                        );
                    }
                }
            }

            // Drop the old digipog_pool_users table
            await dbRun("DROP TABLE IF EXISTS digipog_pool_users", [], database);
            // Rename the temporary table to digipog_pool_users
            await dbRun("ALTER TABLE digipog_pool_users_temp RENAME TO digipog_pool_users", [], database);
        }
    }
}