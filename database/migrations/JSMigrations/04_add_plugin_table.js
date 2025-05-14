const { dbGet, dbGetAll } = require("../../../modules/database");
module.exports = {
    async run(database) {
        const columns = await dbGetAll('PRAGMA table_info(plugins)', [], database);
        const urlColumn = columns.find(column => column.name === 'url');
        if (urlColumn) {
            // If the column exists, then this is a legacy plugins table
            // Drop the old table
            await database.run('DROP TABLE IF EXISTS plugins');
            await database.run('CREATE TABLE IF NOT EXISTS plugins (id INTEGER NOT NULL UNIQUE PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, authors TEXT UNIQUE NOT NULL, description TEXT, version TEXT)', []);
        } else {
            throw new Error('ALREADY_DONE'); // Throw an error for migrate.js to catch and identify this migration as already run
        }
    }
}