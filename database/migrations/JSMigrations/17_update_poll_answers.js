// 17_update_poll_answers.js
// This migration salvages legacy poll answer data from poll_history's names, letter, and text columns
// into the poll_answers table, then removes those columns from poll_history.

const { dbRun, dbGetAll } = require("@modules/database");

module.exports = {
    async run(database) {
        try {
            // Check if migration has already run by checking for classId column in poll_answers
            const tableInfo = await dbGetAll("PRAGMA table_info(poll_answers)", [], database);
            const hasClassId = tableInfo.some((col) => col.name === "classId");
            if (hasClassId) {
                throw new Error("ALREADY_DONE");
            }

            await dbRun("BEGIN TRANSACTION", [], database);

            // Drop old poll_answers and recreate with correct structure including createdAt
            await dbRun("DROP TABLE IF EXISTS poll_answers", [], database);
            await dbRun(
                `CREATE TABLE poll_answers (
                    pollId INTEGER NOT NULL,
                    classId INTEGER NOT NULL,
                    userId INTEGER NOT NULL,
                    buttonResponse TEXT,
                    textResponse TEXT,
                    createdAt INTEGER,
                    PRIMARY KEY (userId, pollId)
                )`,
                [],
                database
            );

            // Salvage legacy data from poll_history's names, letter, and text columns
            const historyColumns = await dbGetAll("PRAGMA table_info(poll_history)", [], database);
            const hasNames = historyColumns.some((col) => col.name === "names");

            if (hasNames) {
                const pollHistory = await dbGetAll("SELECT id, class, names, letter, text FROM poll_history", [], database);

                for (const entry of pollHistory) {
                    let names = [];
                    let letters = [];
                    let texts = [];

                    try {
                        names = entry.names ? JSON.parse(entry.names) : [];
                    } catch (e) {
                        names = [];
                    }
                    try {
                        letters = entry.letter ? JSON.parse(entry.letter) : [];
                    } catch (e) {
                        letters = [];
                    }
                    try {
                        texts = entry.text ? JSON.parse(entry.text) : [];
                    } catch (e) {
                        texts = [];
                    }

                    if (!Array.isArray(names) || names.length === 0) continue;

                    for (let i = 0; i < names.length; i++) {
                        const email = names[i];

                        // letters[i] can be an array (e.g. ["A","B"]) or a string
                        let buttonResponse = null;
                        const rawLetter = letters[i];
                        if (Array.isArray(rawLetter) && rawLetter.length > 0) {
                            buttonResponse = JSON.stringify(rawLetter);
                        } else if (typeof rawLetter === "string" && rawLetter !== "") {
                            buttonResponse = JSON.stringify([rawLetter]);
                        }

                        const rawText = texts[i];
                        const textResponse = typeof rawText === "string" && rawText !== "" ? rawText : null;

                        // Skip if both responses are null
                        if (buttonResponse === null && textResponse === null) continue;

                        // Look up userId by email
                        const users = await dbGetAll("SELECT id FROM users WHERE email = ?", [email], database);

                        if (users.length === 0) continue;

                        const userId = users[0].id;

                        // Insert into poll_answers, ignore duplicates
                        await dbRun(
                            `INSERT OR IGNORE INTO poll_answers (pollId, classId, userId, buttonResponse, textResponse, createdAt)
                             VALUES (?, ?, ?, ?, ?, NULL)`,
                            [entry.id, entry.class, userId, buttonResponse, textResponse],
                            database
                        );
                    }
                }

                // Remove names, letter, and text columns from poll_history by recreating the table
                await dbRun(
                    `CREATE TABLE poll_history_temp (
                        "id"                       INTEGER NOT NULL UNIQUE,
                        "class"                    INTEGER NOT NULL,
                        "prompt"                   TEXT,
                        "responses"                TEXT,
                        "allowMultipleResponses"   INTEGER NOT NULL DEFAULT 0,
                        "blind"                    INTEGER NOT NULL DEFAULT 0,
                        "allowTextResponses"       INTEGER NOT NULL DEFAULT 0,
                        "createdAt"                INTEGER NOT NULL,
                        PRIMARY KEY ("id" AUTOINCREMENT)
                    )`,
                    [],
                    database
                );

                await dbRun(
                    `INSERT INTO poll_history_temp (id, class, prompt, responses, allowMultipleResponses, blind, allowTextResponses, createdAt)
                     SELECT id, class, prompt, responses, allowMultipleResponses, blind, allowTextResponses, createdAt FROM poll_history`,
                    [],
                    database
                );

                await dbRun("DROP TABLE poll_history", [], database);
                await dbRun("ALTER TABLE poll_history_temp RENAME TO poll_history", [], database);
            }

            await dbRun("COMMIT", [], database);
            console.log("Migration 17 completed: poll_answers recreated with classId and createdAt columns.");
        } catch (err) {
            try {
                await dbRun("ROLLBACK", [], database);
            } catch (rollbackErr) {
                // Transaction may not be active
            }
            throw new Error("ALREADY_DONE");
        }
    },
};
