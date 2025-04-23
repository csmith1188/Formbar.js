const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { decrypt } = require('./modules/crypto'); // Old crypto module
const { hash } = require('../modules/crypto'); // New crypto module

const database = new sqlite3.Database('./database/database.db');
const migrationFiles = fs.readdirSync('./database/migrations').filter(file => file.endsWith('.sql')).sort();

for (const migrationFileName of migrationFiles) {
    const migrationSQL = fs.readFileSync(`./database/migrations/${migrationFileName}`, 'utf8');
    console.log(`Running migration: ${migrationFileName}`);

    database.serialize(() => {
        database.run('BEGIN TRANSACTION');

        // Execute migration SQL
        database.exec(migrationSQL, (err) => {
            if (err) {
                console.error(`Error executing migration ${migrationFileName}:`, err);
                database.run('ROLLBACK');
                database.close();
                process.exit(1);
            }

            database.run('COMMIT', (err) => {
                if (err) {
                    console.error(`Error committing migration ${migrationFileName}:`, err);
                    database.run('ROLLBACK');
                    database.close();
                    process.exit(1);
                }

                console.log(`Completed migration: ${migrationFileName}`);
            });
        });
    });

    if (migrationFileName.startsWith("01")) {
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
    }
}