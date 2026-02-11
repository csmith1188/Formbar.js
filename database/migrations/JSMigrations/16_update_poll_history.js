// 16_update_poll_history.js
// This migration makes the poll_history table easier to query. It extracts poll data and responses into separate fields.

const { dbGetAll, dbRun } = require("@modules/database");
module.exports = {
    async run(database) {
        try {
            // await dbRun("BEGIN TRANSACTION", [], database);

            // // Get all pools and pool users
            // const pollHistory = await dbGetAll("SELECT * FROM pollHistory");
            //
            // // Create new poll history table with updated schema
            // await dbRun(`
            //     CREATE TABLE IF NOT EXISTS poll_history_temp (
            //         id INTEGER PRIMARY KEY AUTOINCREMENT,
            //         classId TEXT NOT NULL,
            //         pollId TEXT NOT NULL,
            //         pollData TEXT NOT NULL,
            //         responses TEXT NOT NULL,
            //         createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            //     )
            // `, [], database);
            //
            // // Go through each poll entry
            // for (const pollEntry of pollHistory) {
            //     const pollData = JSON.parse(pollEntry.pollData);
            //
            //     const pollResponses = pollData.responses || [];
            // }

            // await dbRun("COMMIT", [], database);
        } catch (err) {
            await dbRun("ROLLBACK", [], database);
            throw new Error("ALREADY_DONE");
        }
    },
};
