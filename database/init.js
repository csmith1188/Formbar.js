const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");

initializeDatabase();
function initializeDatabase() {
    new Promise((resolve) => {
        if (fs.existsSync("./database/database.db")) {
            console.log("Database already exists. Skipping initialization.");
            process.exit(1);
        }

        if (!fs.existsSync("./database/init.sql")) {
            console.log("SQL initialization file not found.");
            process.exit(1);
        }

        const initSQL = fs.readFileSync("./database/init.sql", "utf8");
        const database = new sqlite3.Database("./database/database.db");
        database.serialize(() => {
            database.run("BEGIN TRANSACTION");

            // Execute initialization SQL
            database.exec(initSQL, (err) => {
                if (err) {
                    console.error("Error executing initialization SQL:", err);
                    database.run("ROLLBACK");
                    database.close();
                    process.exit(1);
                }

                database.run("COMMIT", (err) => {
                    if (err) {
                        console.error("Error committing initialization SQL:", err);
                        database.run("ROLLBACK");
                        database.close();
                        process.exit(1);
                    }

                    console.log("Database initialized successfully.");
                    resolve();
                });

                // Set flag to skip backup during init, then run the migrations
                process.env.SKIP_BACKUP = "true";
                require("./migrate.js");
            });
        });
    });
}

module.exports = {
    initializeDatabase,
};
