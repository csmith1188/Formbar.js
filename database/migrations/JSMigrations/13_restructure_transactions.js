// 13_restructure_transactions.js
// This migration restructures the 'transactions' table to support transactions from digipog pools, to users or other pools.

const { dbGetAll, dbRun } = require("../../../modules/database");
module.exports = {
    async run(database) {
        const columns = await dbGetAll("PRAGMA table_info(transactions)", [], database);
        const fromUserColumn = columns.find((column) => column.name === "from_user");
        if (fromUserColumn) {
            // If the column exists, then this is a legacy transactions table
            // Transfer the data to a new table with the new layout
            const transactions = await dbGetAll("SELECT * FROM transactions", [], database);

            // Create new temporary table
            await dbRun(
                `CREATE TABLE IF NOT EXISTS transactions_temp (
                    "from_id"   INTEGER NOT NULL,
                    "to_id"     INTEGER NOT NULL,
                    "from_type" TEXT NOT NULL,
                    "to_type"   TEXT NOT NULL,
                    "amount"    INTEGER NOT NULL,
                    "reason"    TEXT NOT NULL DEFAULT 'None',
                    "date"      TEXT NOT NULL
                );`,
                [],
                database
            );

            // Migrate data
            for (const transaction of transactions) {
                let fromId, fromType, toId, toType;

                if (!transaction.from_user && transaction.pool) {
                    fromId = transaction.pool;
                    fromType = "pool";
                    toId = transaction.to_user;
                    toType = "user";
                } else if (!transaction.to_user && transaction.pool) {
                    toId = transaction.pool;
                    toType = "pool";
                    fromId = transaction.from_user;
                    fromType = "user";
                } else {
                    fromId = transaction.from_user;
                    fromType = "user";
                    toId = transaction.to_user;
                    toType = "user";
                }

                await dbRun(
                    "INSERT INTO transactions_temp (from_id, to_id, from_type, to_type, amount, reason, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [fromId, toId, fromType, toType, transaction.amount, transaction.reason, transaction.date],
                    database
                );
            }
            // Drop the old transactions table and rename the new one
            await dbRun("DROP TABLE IF EXISTS transactions", [], database);
            await dbRun("ALTER TABLE transactions_temp RENAME TO transactions", [], database);
        } else {
            throw new Error("ALREADY_DONE");
        }
    },
};
