const sqlite3 = require("sqlite3")

function getDatabase() {
    // Establishes the connection to the database file
    return new sqlite3.Database("database/database.db")
}

module.exports = {
    database: getDatabase()
}