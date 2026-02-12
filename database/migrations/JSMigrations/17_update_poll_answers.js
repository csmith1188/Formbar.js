// 17_update_poll_answers.js
// This migration drops and recreates the poll_answers table with the correct structure, including classId.

const { dbRun, dbGetAll } = require("@modules/database");

module.exports = {
    async run(database) {
        try {
            // Check if migration has already run by checking for classId column
            const tableInfo = await dbGetAll("PRAGMA table_info(poll_answers)", [], database);
            const hasClassId = tableInfo.some((col) => col.name === "classId");
            if (hasClassId) {
                throw new Error("ALREADY_DONE");
            }

            // Drop and recreate the table in the correct state
            await dbRun("DROP TABLE IF EXISTS poll_answers", [], database);
            await dbRun(
                `CREATE TABLE poll_answers (
                    pollId INTEGER NOT NULL,
                    classId INTEGER NOT NULL,
                    userId INTEGER NOT NULL,
                    buttonResponse TEXT,
                    textResponse TEXT,
                    PRIMARY KEY (userId, pollId)
                )`,
                [],
                database
            );

            console.log("Migration 17 completed: poll_answers table recreated with classId column.");
        } catch (err) {
            if (err.message === "ALREADY_DONE") {
                throw err;
            }
            throw new Error("ALREADY_DONE");
        }
    },
};
