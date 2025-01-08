const sqlite3 = require('sqlite3');
const { decrypt } = require('./modules/crypto');

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

    // Set 

    switch (databaseVersion) {
        case null:
            
            break;
    }
}

module.exports = {
    upgradeDatabase
}