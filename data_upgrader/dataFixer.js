const sqlite3 = require('sqlite3');
const fs = require('fs');
const { decrypt } = require('./modules/crypto'); // Old crypto module
const { hash } = require('../crypto'); // New crypto module

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
    fs.copyFileSync('database/database.db', 'database/database.bak');

    switch (databaseVersion) {
        case null: // Pre-v1 database verson
            // Move passwords to be hashed rather than encrypted for security purposes
            database.all('SELECT * FROM users', (err, rows) => {
                if (err) {
                    console.error(err);
                    return;
                }

                for (const row of rows) {
                    const decryptedPassword = decrypt(row.password);
                    // Password hashing needs fixed before this
                }
            });

            // Create database stats table and set the version to 1
            database.run('CREATE TABLE stats (key TEXT, value TEXT)');
            database.run('INSERT INTO stats VALUES ("dbVersion", "1")');
    }
}

module.exports = {
    upgradeDatabase
}