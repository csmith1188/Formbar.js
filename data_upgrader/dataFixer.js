const sqlite3 = require('sqlite3');
const fs = require('fs');
const { decrypt } = require('./modules/crypto'); // Old crypto module
const { hash } = require('../modules/crypto'); // New crypto module

// Open database
const database = new sqlite3.Database('database/database.db');
let CURRENT_VERSION = 1;

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
    if (databaseVersion == CURRENT_VERSION) {
        console.log("Database is up to date.");
        return;
    }

    // Backup the database
    // If there's already a backup, denote it with a number
    let backupNumber = 0;
    while (fs.existsSync(`database/database-${backupNumber}.bak`)) {
        backupNumber++;
    }
    fs.copyFileSync('database/database.db', 'database/database.bak');

    switch (databaseVersion) {
        case null: // Pre-v1 database verson
            // Update passwords from encrypted to hashed
            database.all('SELECT * FROM users', async (err, rows) => {
                if (err) {
                    console.error(err);
                    return;
                }

                for (const row of rows) {
                    const decryptedPassword = decrypt(JSON.parse(row.password));
                    const hashedPassword = await hash(decryptedPassword);
                    database.run('UPDATE users SET password=? WHERE id=?', [hashedPassword, row.id]);
                }
            });

            // Create refresh_tokens table
            database.run('CREATE TABLE refresh_tokens (user_id INTEGER, refresh_token TEXT NOT NULL UNIQUE, exp INTEGER NOT NULL)');

            // Create database stats table and set the version to 1
            database.run('CREATE TABLE stats (key TEXT NOT NULL, value TEXT)', () => {
                database.run('INSERT INTO stats VALUES ("dbVersion", "1")');
            });
    }
}

module.exports = {
    upgradeDatabase
}