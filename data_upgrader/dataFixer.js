const sqlite3 = require('sqlite3');
const fs = require('fs');
const { decrypt } = require('./modules/crypto'); // Old crypto module
const { hash } = require('../modules/crypto'); // New crypto module

// Open database
const database = new sqlite3.Database('database/database.db');
const CURRENT_VERSION = 1;

function getDatabaseVersion() {
    return new Promise((resolve, reject) => {
        database.get('SELECT name FROM sqlite_master WHERE type="table" AND name="stats"', (err, row) => {
            if (err) {
                reject(err);
            } else {
                if (row) {
                    // Get dbVersion
                    database.get('SELECT * FROM stats WHERE key="dbVersion"', (err, row) => {
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
    const databaseVersion = await getDatabaseVersion();
    if (databaseVersion == CURRENT_VERSION) return;

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
            // Create refresh_tokens table
            database.run('CREATE TABLE "refresh_tokens" (user_id INTEGER, refresh_token TEXT NOT NULL UNIQUE, exp INTEGER NOT NULL)');

            // Add email and verified fields to users 
            database.run('ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ""');
            database.run('ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 0');

            // Update passwords from encrypted to hashed and add new fields
            database.all('SELECT * FROM users', async (err, rows) => {
                if (err) {
                    console.error(err);
                    return;
                }

                for (const row of rows) {
                    const decryptedPassword = decrypt(JSON.parse(row.password));
                    const hashedPassword = await hash(decryptedPassword);
                    database.run('UPDATE users SET password=?, email="", verified=0 WHERE id=?', [hashedPassword, row.id]);
                }
            });
            
            // Create database stats table and set the version to 1
            database.run('CREATE TABLE "stats" (key TEXT NOT NULL, value TEXT)', () => {
                database.run('INSERT INTO stats VALUES ("dbVersion", "1")');
            });
    }
    console.log(`Database upgraded to: ${CURRENT_VERSION}!`);
}

module.exports = {
    upgradeDatabase
}