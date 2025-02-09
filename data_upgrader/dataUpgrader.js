const fs = require('fs');
const { decrypt } = require('./modules/crypto'); // Old crypto module
const { hash } = require('../modules/crypto'); // New crypto module
const { database, databaseTemplate } = require('../modules/database');

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
            database.run('CREATE TABLE IF NOT EXISTS "refresh_tokens" (user_id INTEGER, refresh_token TEXT NOT NULL UNIQUE, exp INTEGER NOT NULL)');

            // Add email and verified fields to users
            database.run('ALTER TABLE users ADD COLUMN email TEXT DEFAULT ""', [], () => {});
            database.run('ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0', [], () => {});

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
            
            // Create database stats table and set the version to 1
            database.run('CREATE TABLE IF NOT EXISTS "stats" (key TEXT NOT NULL, value TEXT)', () => {
                database.run('INSERT INTO stats VALUES ("dbVersion", "1")');
            });
    }

    console.log(`Database upgraded to version ${currentVersion}!`);
}

module.exports = {
    upgradeDatabase
}