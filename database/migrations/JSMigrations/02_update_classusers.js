// 02_update_classusers.js
// This migration removes the 'digipogs' column from the 'classusers' table
// and adds a new 'tags' column to the same table.

const { dbGetAll } = require("../../../modules/database");
module.exports = {
    async run(database) {
        const columns = await dbGetAll("PRAGMA table_info(classusers)", [], database);
        const digipogsColumn = columns.find((column) => column.name === "digipogs");
        const tagsColumn = columns.find((column) => column.name === "tags");
        if (!digipogsColumn && tagsColumn) {
            // Tags column already exists and digipogs column doesn't exist, so the migration has already run
            throw new Error("ALREADY_DONE");
        }

        if (digipogsColumn) {
            // Create a new classusers table without the digipogs column
            await database.run(
                `CREATE TABLE IF NOT EXISTS temp_classusers (
                "classId"       INTEGER NOT NULL,
                "studentId"     INTEGER NOT NULL,
                "permissions"   INTEGER NOT NULL
            )`,
                []
            );

            // Copy existing data from classusers to the new table (excluding digipogs)
            await database.run(
                `INSERT INTO temp_classusers ("classId", "studentId", "permissions")
            SELECT "classId", "studentId", "permissions" FROM classusers`,
                []
            );

            // Drop the old classusers table and rename the new one
            await database.run("DROP TABLE classusers", []);
            await database.run("ALTER TABLE temp_classusers RENAME TO classusers", []);
        }

        if (!tagsColumn) {
            // Create a new classusers table with the tags column
            await dbRun(
                "CREATE TABLE IF NOT EXISTS classusers_temp (classId INTEGER NOT NULL, studentId INTEGER NOT NULL, permissions INTEGER NOT NULL, tags TEXT)",
                [],
                database
            );

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
            await dbRun("DROP TABLE classusers", [], database);
            await dbRun("ALTER TABLE classusers_temp RENAME TO classusers", [], database);
        }
    },
};
