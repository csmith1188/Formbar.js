const { dbGetAll } = require("../../../modules/database");
module.exports = {
    async run(database) {
        const columns = await dbGetAll("PRAGMA table_info(classusers)", [], database);
        const digipogsColumn = columns.find((column) => column.name === "digipogs");
        if (!digipogsColumn) {
            // Digipogs column doesn't exist, migration already run
            throw new Error("ALREADY_DONE");
        }

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
        await database.run('DROP TABLE classusers', []);
        await database.run('ALTER TABLE temp_classusers RENAME TO classusers', []);
    },
};
