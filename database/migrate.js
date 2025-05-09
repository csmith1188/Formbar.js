const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { decrypt } = require('./modules/crypto'); // Old crypto module
const { hash } = require('../modules/crypto'); // New crypto module

// Retrieve the database and migration files
const database = new sqlite3.Database('./database/database.db');
const migrationFiles = fs.readdirSync('./database/migrations').filter(file => file.endsWith('.sql')).sort();
const jsMigrationFiles = fs.readdirSync('./database/migrations/JSMigrations').filter(file => file.endsWith('.js')).sort();

// Backup the database
// If there's already a backup, denote it with a number
let backupNumber = fs.existsSync("database/database.bak") ? 1 : 0;
while (fs.existsSync(`database/database-${backupNumber}.bak`)) {
    backupNumber++;
}

const backupPath = backupNumber == 0 ? 'database/database.bak' : `database/database-${backupNumber}.bak`;
fs.copyFileSync('database/database.db', backupPath);

// Run migration files
function executeMigration(index) {
    // When there are no more migration files, return
    if (index >= migrationFiles.length) {
        database.close();
        return;
    }

    const migrationFileName = migrationFiles[index];
    const migrationSQL = fs.readFileSync(`./database/migrations/${migrationFileName}`, 'utf8');
    console.log(`Running migration: ${migrationFileName}`);

    database.serialize(() => {
        database.run('BEGIN TRANSACTION');

        // Execute migration SQL
        database.exec(migrationSQL, (err) => {
            if (err) {
                database.run('ROLLBACK');
                if (err.message.includes("duplicate column name")) {
                    console.log("Unable to complete migration as this migration has already been run. Continuing to next migration.");
                    executeMigration(index + 1);
                } else {
                    console.error(`Error executing migration ${migrationFileName}:`, err);
                    database.close();
                    process.exit(1);
                }

            } else {
                database.run('COMMIT', (err) => {
                    if (err) {
                        console.error(`Error committing migration ${migrationFileName}:`, err);
                        database.run('ROLLBACK');
                        database.close();
                        process.exit(1);
                    }

                    console.log(`Completed migration: ${migrationFileName}`);
                    executeMigration(index + 1);
                });
            }
        });
    });

    if (migrationFileName.startsWith("01")) {
        // Update passwords from encrypted to hashed
        database.all('SELECT * FROM users', async (err, users) => {
            if (err) {
                console.error(err);
                return;
            }

            for (const user of users) {
                if (user.email !== undefined) continue; // If the email column exists, skip this row as it is already upgraded
                const decryptedPassword = decrypt(JSON.parse(user.password));
                const hashedPassword = await hash(decryptedPassword);
                database.run('UPDATE users SET password=? WHERE id=?', [hashedPassword, user.id]);
            }
        });
    }
}

// Begin migrations
executeMigration(0);