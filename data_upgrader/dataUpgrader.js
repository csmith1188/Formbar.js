const fs = require('fs');
const { decrypt } = require('./modules/crypto'); // Old crypto module
const { hash } = require('../modules/crypto'); // New crypto module
const { database, databaseTemplate, dbRun, dbGetAll } = require('../modules/database');

function getDatabaseVersion(db) {
    return new Promise((resolve, reject) => {
        db.get('SELECT name FROM sqlite_master WHERE type="table" AND name="stats"', (err, row) => {
            if (err) {
                reject(err);
            } else {
                if (row) {
                    // Get dbVersion
                    db.get('SELECT * FROM stats WHERE key="dbVersion"', (err, row) => {
                        if (err) {
                            reject(err);
                        }

                        if (row) {
                            resolve(row.value);
                        } else {
                            resolve(null);
                        }
                    });
                } else {
                    // Database is pre-v1 and has no stats table
                    resolve(null);
                }
            }
        });
    });
}

// Create a table in the database based on the table in the template database
// This is used for creating new tables in the database
function createTable(tableName) {
    return new Promise(async (resolve, reject) => {
        try {
            // Get columns from the table in the template database
            const columns = await dbGetAll(`PRAGMA table_info(${tableName})`, [], databaseTemplate);
            const columnDefinitions = columns
                .map(column => `${column.name} ${column.type} ${column.notnull ? 'NOT NULL' : ''} ${column.pk ? 'PRIMARY KEY' : ''} ${column.dflt_value ? `DEFAULT ${column.dflt_value}` : ''} ${column.pk ? 'AUTOINCREMENT' : ''}`)
                .join(', ');

            // Create the table with the new columns
            await dbRun(`CREATE TABLE ${tableName} (${columnDefinitions})`, []);
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

// Grab the table in the latest database-template and recreate it
// Creates a temporary table with the new columns then copies the data over
// Drops the old table and renames the temporary table to the old table name
function recreateTable(tableName) {
    return new Promise(async (resolve, reject) => {
        try {
            // Get columns from the table in the template database
            const columns = await dbGetAll(`PRAGMA table_info(${tableName})`, [], databaseTemplate);
            const columnDefinitions = columns
                .map(column => `${column.name} ${column.type} ${column.notnull ? 'NOT NULL' : ''} ${column.pk ? 'PRIMARY KEY' : ''} ${column.dflt_value ? `DEFAULT ${column.dflt_value}` : ''} ${column.pk ? 'AUTOINCREMENT' : ''}`)
                .join(', ');

            // Check if the temporary table already exists and drop it if it does
            // Create a temporary table with the new columns
            await dbRun(`DROP TABLE IF EXISTS ${tableName}_temp`, []);
            await dbRun(`CREATE TABLE ${tableName}_temp (${columnDefinitions})`, []);

            // Get old and new columns
            // Match them with the original columns to check which ones they have in common
            const originalColumns = (await dbGetAll(`PRAGMA table_info(${tableName})`, [])).map(col => col.name);
            const newColumns = (await dbGetAll(`PRAGMA table_info(${tableName}_temp)`, [])).map(col => col.name);
            const commonColumns = originalColumns.filter(col => newColumns.includes(col));

            // Copy the data over only from columns that they have in common
            // This is to support columns being removed
            const rows = await dbGetAll(`SELECT ${commonColumns.join(', ')} FROM ${tableName}`, []);
            for (const row of rows) {
                const values = newColumns.map(column => {
                    const columnInfo = columns.find(col => col.name === column);
                    if (columnInfo.notnull && row[column] === undefined) {
                        return "NULL";
                    }

                    return row[column] !== undefined ? row[column] : null;
                });
                await dbRun(`INSERT INTO ${tableName}_temp VALUES (${values.map(() => '?').join(', ')})`, values);
            }

            // Drop the old table and rename the temporary table to the original table name
            await dbRun(`DROP TABLE ${tableName}`, []);
            await dbRun(`ALTER TABLE ${tableName}_temp RENAME TO ${tableName}`, []);

            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

async function upgradeDatabase() {
    const databaseVersion = await getDatabaseVersion(database); // Get the current version of the database
    const currentVersion = await getDatabaseVersion(databaseTemplate); // Get the latest database version
    if (databaseVersion == currentVersion) return;

    // Backup the database
    // If there's already a backup, denote it with a number
    let backupNumber = fs.existsSync("database/database.bak") ? 1 : 0;
    while (fs.existsSync(`database/database-${backupNumber}.bak`)) {
        backupNumber++;
    }

    const backupPath = backupNumber == 0 ? 'database/database.bak' : `database/database-${backupNumber}.bak`;
    fs.copyFileSync('database/database.db', backupPath);

    switch (databaseVersion) {
        case null: // Pre-v1 database verson
            // Create refresh_tokens table if there is not already a refresh_tokens table
            await dbRun('CREATE TABLE IF NOT EXISTS "refresh_tokens" (user_id INTEGER, refresh_token TEXT NOT NULL UNIQUE, exp INTEGER NOT NULL)', []);

            // Recreate the users table
            await recreateTable('users');

            // Update passwords from encrypted to hashed and add new fields
            database.all('SELECT * FROM users', async (err, rows) => {
                if (err) {
                    console.error(err);
                    return;
                }

                for (const row of rows) {
                    // Skip if the email is already present as they have likely already had their password updated
                    if (row.email) continue;

                    const decryptedPassword = decrypt(JSON.parse(row.password));
                    const hashedPassword = await hash(decryptedPassword);
                    database.run('UPDATE users SET password=? WHERE id=?', [hashedPassword, row.id]);
                }
            });
    }

    // Recreate all the tables in the database
    const tables = await dbGetAll('SELECT name FROM sqlite_master WHERE type="table"', [], database);
    for (const table of tables) {
        if (table.name == "sqlite_sequence" || table.name.endsWith('_temp')) continue; // Skip sqlite_sequence table and temporary tables
        await recreateTable(table.name);
    }

    // If there is a new table in the template database that is not in the current database, create it
    const templateTables = await dbGetAll('SELECT name FROM sqlite_master WHERE type="table"', [], databaseTemplate);
    for (const table of templateTables) {
        const tableExists = await dbGetAll('SELECT name FROM sqlite_master WHERE type="table" AND name=?', [table.name], database);
        if (tableExists.length == 0) {
            await createTable(table.name);
        }
    }

    // Update the database version
    await dbRun('CREATE TABLE IF NOT EXISTS "stats" (key TEXT NOT NULL, value TEXT)');
    await dbRun(`UPDATE stats SET value="${currentVersion}" WHERE key="dbVersion"`, []);
    console.log(`Database upgraded to version ${currentVersion}!`);
}

module.exports = {
    upgradeDatabase
}