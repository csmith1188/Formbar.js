const sqlite3 = require("sqlite3")
const fs = require("fs")

const database = getDatabase();
function getDatabase() {
    // If the database file doesn't exist, copy the template
    if (!fs.existsSync("database/database.db")) {
        fs.copyFileSync("database/database-template.db", "database/database.db")
    }
``
    // Establishes the connection to the database file
    return new sqlite3.Database("database/database.db")
}

function getAll(query, params) {
	return new Promise((resolve, reject) => {
		database.all(query, params, (err, rows) => {
			if (err) {
                reject(new Error(err))
            } else {
                resolve(rows)
            }
		})
	})
}

function runQuery(query, params) {
	return new Promise((resolve, reject) => {
		database.run(query, params, (err) => {
			if (err) {
                reject(new Error(err))
            } else {
                resolve()
            }
		})
	})
}

module.exports = {
    database,
    getAll,
    runQuery
}