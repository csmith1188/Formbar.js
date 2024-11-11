const sqlite3 = require("sqlite3")
const fs = require("fs")

function getDatabase() {
    // If the database file doesn't exist, copy the template
    if (!fs.existsSync("database/database.db")) {
        fs.copyFileSync("database/database-template.db", "database/database.db")
    }
``
    // Establishes the connection to the database file
    return new sqlite3.Database("database/database.db")
}

module.exports = {
    database: getDatabase()
}