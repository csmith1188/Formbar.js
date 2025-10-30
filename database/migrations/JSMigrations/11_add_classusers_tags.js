const { dbGetAll, dbRun } = require("../../../modules/database");
module.exports = {
    async run(database) {
        const columns = await dbGetAll("PRAGMA table_info(classusers)", [], database);
        const tagsColumn = columns.find((column) => column.name === "tags");
        if (tagsColumn) {
            // Tags column already exists, migration already run
            throw new Error("ALREADY_DONE");
        }

        // Create a new classusers table with the tags column
        await dbRun("CREATE TABLE IF NOT EXISTS classusers_temp (classId INTEGER NOT NULL, studentId INTEGER NOT NULL, permissions INTEGER NOT NULL, tags TEXT)", [], database);


        // Copy existing data from classusers to the new table
        await dbRun(
            `INSERT INTO classusers_temp (
                classId, studentId, permissions, tags
            )
            SELECT
                classId,
                studentId,
                permissions,
                NULL
            FROM classusers`,
            [],
            database
        );

        // Drop the old classusers table and rename the new one
        await dbRun('DROP TABLE classusers', [], database);
        await dbRun('ALTER TABLE classusers_temp RENAME TO classusers', [], database);
    },
};
