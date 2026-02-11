// 17_update_poll_answers.js
// This migration optimizes the poll_answers table by combining buttonResponse entries for each user if the pollId is the same for multiple entries.
// Previously, each buttonResponse was stored as a separate entry even if they belonged to the same poll and user.

const { dbGetAll, dbRun } = require("@modules/database");

module.exports = {
    async run(database) {
        try {
            // Check if migration has already run by checking the table structure
            const tableInfo = await dbGetAll("PRAGMA table_info(poll_answers)", [], database);
            const indexList = await dbGetAll("PRAGMA index_list(poll_answers)", [], database);

            // If there's a PRIMARY KEY index, the migration has likely already run
            const hasPrimaryKey = indexList.some((idx) => idx.origin === "pk");
            if (hasPrimaryKey) {
                // Check if it's a composite key (userId, pollId)
                const pkIndex = indexList.find((idx) => idx.origin === "pk");
                if (pkIndex) {
                    // Migration already completed
                    throw new Error("ALREADY_DONE");
                }
            }

            // Enable performance optimizations for this migration (must be outside transaction)
            await dbRun("PRAGMA temp_store = MEMORY", [], database);
            await dbRun("PRAGMA synchronous = OFF", [], database);
            await dbRun("PRAGMA journal_mode = MEMORY", [], database);

            // Start transaction after PRAGMA settings
            await dbRun("BEGIN TRANSACTION", [], database);

            // Create a new table with the optimized structure
            await dbRun(
                `CREATE TABLE poll_answers_new (
                    userId TEXT,
                    pollId TEXT,
                    buttonResponse TEXT,
                    PRIMARY KEY (userId, pollId)
                )`,
                [],
                database
            );

            // Get count of entries that need merging (for progress tracking)
            const duplicateCount = await dbGetAll(
                `SELECT COUNT(*) as count FROM (SELECT userId, pollId FROM poll_answers GROUP BY userId, pollId HAVING COUNT(*) > 1)`,
                [],
                database
            );

            const totalDuplicates = duplicateCount[0]?.count || 0;
            console.log(`Found ${totalDuplicates} userId/pollId combinations with duplicates to merge`);

            // Process combinations in batches to avoid memory issues
            const BATCH_SIZE = 5000;
            let processed = 0;

            // Get distinct userId/pollId combinations
            const combinations = await dbGetAll("SELECT DISTINCT userId, pollId FROM poll_answers", [], database);

            console.log(`Processing ${combinations.length} total combinations in batches of ${BATCH_SIZE}...`);

            for (let i = 0; i < combinations.length; i += BATCH_SIZE) {
                const batch = combinations.slice(i, i + BATCH_SIZE);

                // Prepare batch insert using a single transaction
                const values = [];
                const placeholders = [];

                for (const { userId, pollId } of batch) {
                    // Get all buttonResponses for this userId/pollId combination
                    const responses = await dbGetAll(
                        `SELECT buttonResponse 
                         FROM poll_answers 
                         WHERE userId = ? AND pollId = ?
                         ORDER BY rowid`,
                        [userId, pollId],
                        database
                    );

                    // Combine all buttonResponses into an array
                    // buttonResponse is plain text or null, not JSON
                    const combinedResponses = [];

                    for (const row of responses) {
                        // Only add non-null values
                        if (row.buttonResponse !== null && row.buttonResponse !== undefined) {
                            combinedResponses.push(row.buttonResponse);
                        }
                    }

                    placeholders.push("(?, ?, ?)");
                    values.push(userId, pollId, JSON.stringify(combinedResponses));
                }

                // Batch insert all combined entries at once
                if (placeholders.length > 0) {
                    await dbRun(`INSERT INTO poll_answers_new (userId, pollId, buttonResponse) VALUES ${placeholders.join(", ")}`, values, database);
                }

                processed += batch.length;
                console.log(`Processed ${processed}/${combinations.length} combinations (${Math.round((processed / combinations.length) * 100)}%)`);
            }

            console.log("Replacing old table with new optimized table...");
            // Drop the old table and rename the new one
            await dbRun("DROP TABLE poll_answers", [], database);
            await dbRun("ALTER TABLE poll_answers_new RENAME TO poll_answers", [], database);

            // Restore normal PRAGMA settings
            await dbRun("PRAGMA synchronous = FULL", [], database);
            await dbRun("PRAGMA journal_mode = DELETE", [], database);

            await dbRun("COMMIT", [], database);
            console.log("Migration completed successfully!");
        } catch (err) {
            await dbRun("PRAGMA synchronous = FULL", [], database);
            await dbRun("PRAGMA journal_mode = DELETE", [], database);
            await dbRun("ROLLBACK", [], database);
            throw new Error("ALREADY_DONE");
        }
    },
};
