const { dbGetAll } = require("../../../modules/database");
module.exports = {
    async run(database) {
        const columns = await dbGetAll('PRAGMA table_info(transactions)', [], database);
        const digipogsColumn = columns.find(column => column.name === 'digipogs');
        if (digipogsColumn) {
            // If the column exists, then this is a legacy transactions table
            // Drop the old table
            await database.run('DROP TABLE IF EXISTS transactions');
            await database.run('CREATE TABLE IF NOT EXISTS "transactions" ("from_user" INTEGER NOT NULL, "to_user" INTEGER NOT NULL, "amount" INTEGER NOT NULL, "reason" TEXT DEFAULT "None", "date" TEXT NOT NULL)', []);
        } else {
            throw new Error('ALREADY_DONE'); // Throw an error for migrate.js to catch and identify this migration as already run
        }
    }
}