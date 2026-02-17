// Adds JSDoc comments to improve editor/tooling hints and generated docs
const sqlite3 = require("sqlite3");
const database = getDatabase();

/**
 * Return an open sqlite3 Database connected to the project's DB file.
 * This function centralizes the path used to open the database so it can be
 * changed in one place if needed.
 * @returns {sqlite3.Database} An open sqlite3 Database instance connected to "database/database.db".
 */
function getDatabase() {
    // Establishes the connection to the database file
    return new sqlite3.Database("database/database.db");
}

/**
 * Execute a single-row SELECT query and return the first row.
 * @param {string} query - SQL query string (may contain placeholders like ? or named parameters).
 * @param {Array|Object} [params] - Optional parameters to bind to the SQL query.
 * @param {sqlite3.Database} [db=database] - Optional sqlite3 Database instance to run the query against.
 * @returns {Promise<Object|null>} Promise that resolves with the first row (object) or null if not found.
 * @throws Will reject the promise with the sqlite3 error if the query fails.
 */
function dbGet(query, params, db = database) {
    const callStack = new Error().stack;
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) {
                console.error(callStack);
                return reject(err);
            }
            resolve(row);
        });
    });
}

/**
 * Execute a statement that modifies the database (INSERT, UPDATE, DELETE).
 * Resolves with the last inserted row id (this.lastID) for INSERT statements.
 * @param {string} query - SQL statement to execute.
 * @param {Array|Object} [params] - Optional parameters to bind to the SQL statement.
 * @param {sqlite3.Database} [db=database] - Optional sqlite3 Database instance to run the statement against.
 * @returns {Promise<number>} Promise that resolves with the last inserted row id (this.lastID) or a numeric result from sqlite3.
 * @throws Will reject the promise with the sqlite3 error if the statement fails.
 */
function dbRun(query, params, db = database) {
    const callStack = new Error().stack;
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) {
                console.error(callStack);
                return reject(err);
            }
            resolve(this.lastID);
        });
    });
}

/**
 * Execute a query that returns multiple rows.
 * @param {string} query - SQL query string.
 * @param {Array|Object} [params] - Optional parameters to bind to the SQL query.
 * @param {sqlite3.Database} [db=database] - Optional sqlite3 Database instance to run the query against.
 * @returns {Promise<Array<Object>>} Promise that resolves with an array of row objects (empty array if no rows).
 * @throws Will reject the promise with the sqlite3 error if the query fails.
 */
function dbGetAll(query, params, db = database) {
    const callStack = new Error().stack;
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                console.error(callStack);
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
