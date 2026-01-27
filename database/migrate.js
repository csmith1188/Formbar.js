const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const { decrypt } = require("./modules/crypto"); // Old crypto module
const { hash } = require("@modules/crypto"); // New crypto module

// Get all migration files and sort them by filename
const sqlMigrations = fs
    .readdirSync("./database/migrations")
    .filter((file) => file.endsWith(".sql"))
    .map((file) => ({
        type: "sql",
        filename: file,
        path: `./database/migrations/${file}`,
    }));

if (!fs.existsSync("./database/migrations/JSMigrations")) {
    fs.mkdirSync("./database/migrations/JSMigrations");
}

const jsMigrations = fs
    .readdirSync("./database/migrations/JSMigrations")
    .filter((file) => file.endsWith(".js"))
    .map((file) => ({
        type: "js",
        filename: file,
        path: `./migrations/JSMigrations/${file}`,
    }));

// Combine and sort all migrations
const allMigrations = [...sqlMigrations, ...jsMigrations].sort((a, b) => a.filename.localeCompare(b.filename));

// Backup the database if there's already a database, unless the SKIP_BACKUP flag is set
// If there's already a backup, denote it with a number
if (fs.existsSync("database/database.db") && !process.env.SKIP_BACKUP) {
    let backupNumber = fs.existsSync("database/database.bak") ? 1 : 0;
    while (fs.existsSync(`database/database-${backupNumber}.bak`)) {
        backupNumber++;
    }

    const backupPath = backupNumber == 0 ? "database/database.bak" : `database/database-${backupNumber}.bak`;
    fs.copyFileSync("database/database.db", backupPath);
}

// Retrieve the database
const database = new sqlite3.Database("./database/database.db");

// Run migrations in sequence
async function executeMigration(index) {
    // When there are no more migrations, close the database
    if (index >= allMigrations.length) {
        database.close();
        return;
    }

    const migration = allMigrations[index];
    console.log(`Running ${migration.type.toUpperCase()} migration: ${migration.filename}`);

    try {
        if (migration.type === "sql") {
            await executeSQLMigration(migration);
        } else {
            await executeJSMigration(migration);
        }

        console.log(`Completed ${migration.type.toUpperCase()} migration: ${migration.filename}`);
        await executeMigration(index + 1);
    } catch (err) {
        console.error(`Error executing ${migration.type.toUpperCase()} migration ${migration.filename}:`, err);
        database.close();
        process.exit(1);
    }
}

// Execute a single SQL migration
async function executeSQLMigration(migration) {
    const migrationSQL = fs.readFileSync(migration.path, "utf8");

    return new Promise((resolve, reject) => {
        database.serialize(() => {
            database.run("BEGIN TRANSACTION");

            database.exec(migrationSQL, (err) => {
                if (err) {
                    database.run("ROLLBACK");

                    // If --verbose flag is set, log the error
                    if (process.argv.includes("verbose")) {
                        console.error(err);
                    }

                    console.log(
                        "Unable to complete migration as this migration has already been run, or an error has occurred. Continuing to next migration."
                    );
                    resolve();
                } else {
                    database.run("COMMIT", (err) => {
                        if (err) {
                            database.run("ROLLBACK");
                            reject(err);
                        }

                        // Special handling for migration 01 (password conversion)
                        if (migration.filename.startsWith("01")) {
                            database.all("SELECT * FROM users", async (err, users) => {
                                if (err) {
                                    console.error(err);
                                    return;
                                }

                                for (const user of users) {
                                    if (user.email !== undefined) continue;
                                    const decryptedPassword = decrypt(JSON.parse(user.password));
                                    const hashedPassword = await hash(decryptedPassword);
                                    database.run("UPDATE users SET password=? WHERE id=?", [hashedPassword, user.id]);
                                }
                            });
                        }

                        resolve();
                    });
                }
            });
        });
    });
}

// Execute a single JS migration
async function executeJSMigration(migration) {
    try {
        const migrationModule = require(migration.path);
        await migrationModule.run(database);
    } catch (err) {
        if (err.message === "ALREADY_DONE") {
            console.log("Unable to complete migration as this migration has already been run. Continuing to next migration.");
            return;
        }

        // Rollback the transaction if there was an error
        database.run("ROLLBACK");
        console.error(`Error executing JS migration ${migration.filename}:`, err);
        throw err;
    }
}

// Begin migrations
executeMigration(0);
