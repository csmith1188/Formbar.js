const sqlite3 = require("sqlite3");
const { logger } = require("./logger");
const database = getDatabase();

function getDatabase() {
    // Establishes the connection to the database file
    return new sqlite3.Database("database/database.db");
}

function dbGet(query, params, db = database) {
    const callStack= new Error().stack;
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) {
                console.error(callStack)
                return reject(err);
            }
            resolve(row);
        });
    });
}

function dbRun(query, params, db = database) {
    const callStack= new Error().stack;
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) {
                console.error(callStack)
                return reject(err);
            }
            resolve(this.lastID);
        });
    });
}

function dbGetAll(query, params, db = database) {
    const callStack= new Error().stack;
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                console.error(callStack)
                return reject(err);
            }
            resolve(rows);
        });
    });
}
module.exports = {
    database,
    dbGet,
    dbRun,
    dbGetAll,
};
