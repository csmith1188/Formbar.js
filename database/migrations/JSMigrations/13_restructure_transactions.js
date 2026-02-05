// 13_restructure_transactions.js
// This migration restructures the 'transactions' table to support transactions from digipog pools, to users or other pools.

const { dbGetAll, dbRun } = require("../../../modules/database");
module.exports = {
    async run(database) {
        const columns = await dbGetAll("PRAGMA table_info(transactions)", [], database);
        const fromUserColumn = columns.find((column) => column.name === "from_user");
        if (fromUserColumn) { // If the column exists, then this is a legacy transactions table
            //transfer the data to a new table with the new layout
            transactions = await dbGetAll("SELECT * FROM transactions", [], database);
            //create new temporary table
            await dbRun(
                `CREATE TABLE IF NOT EXISTS transactions_temp (
                    "from_id"   INTEGER NOT NULL,
                    "to_id"     INTEGER NOT NULL,
                    "from_type" TEXT NOT NULL,
                    "to_type"   TEXT NOT NULL,
                    "amount"    INTEGER NOT NULL,
                    "reason"    TEXT NOT NULL DEFAULT "None",
                    "date"      TEXT NOT NULL
                );`,
                [],
                database
            );
            //migrate data
            for (const transaction of transactions) {
                let fromId = transaction.from_user;
                let fromType = "user";
                let toId = transaction.to_user;
                let toType = "user";
                if (transaction.pool) {
                    toId = transaction.pool;
                    toType = "pool";
                }
                await dbRun(
                    "INSERT INTO transactions_temp (from_id, from_type, to_id, to_type, amount, reason, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [fromId, fromType, toId, toType, transaction.amount, transaction.reason, transaction.date],
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