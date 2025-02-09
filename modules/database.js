const sqlite3 = require('sqlite3');
const fs = require('fs');
const database = getDatabase();
const databaseTemplate = getDatabaseTemplate();

function getDatabase() {
    // If the database file doesn't exist, copy the template
    if (!fs.existsSync('database/database.db')) {
        fs.copyFileSync('database/database-template.db', 'database/database.db')
    };

    // Establishes the connection to the database file
    return new sqlite3.Database('database/database.db')
}

function getDatabaseTemplate() {
    return new sqlite3.Database('database/database-template.db')
}

function dbGet(query, params) {
    return new Promise((resolve, reject) => {
        database.get(query, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function dbRun(query, params) {
    return new Promise((resolve, reject) => {
        database.run(query, params, function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
        });
    });
}

function dbGetAll(query, params) {
    return new Promise((resolve, reject) => {
        database.all(query, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

module.exports = {
    database,
    databaseTemplate,
    dbGet,
    dbRun,
    dbGetAll,
};