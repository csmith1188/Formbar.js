/**
 * Test database helper.
 *
 * Creates an in-memory SQLite database initialised with the project's full
 * current schema (modules/test-helpers/test-schema.sql).  Every service test
 * file uses this helper instead of the real on-disk database, so tests are
 * fast, isolated, and side-effect-free.
 *
 * Usage in a test file
 * --------------------
 *   let testDb;
 *
 *   jest.mock('@modules/database', () => ({
 *     get database() { return testDb && testDb.db; },
 *     dbGet:    (...a) => testDb.dbGet(...a),
 *     dbRun:    (...a) => testDb.dbRun(...a),
 *     dbGetAll: (...a) => testDb.dbGetAll(...a),
 *   }));
 *
 *   beforeAll(async () => { testDb = await createTestDb(); });
 *   afterEach(async () => { await testDb.reset(); });
 *   afterAll(async ()  => { await testDb.close(); });
 */

const sqlite3 = require("sqlite3");
const fs = require("fs");
const path = require("path");

const SCHEMA_PATH = path.join(__dirname, "test-schema.sql");

/**
 * Promise-based wrapper around sqlite3.Database.get()
 */
function makeDbGet(db) {
    return function dbGet(query, params, overrideDb) {
        const target = overrideDb || db;
        return new Promise((resolve, reject) => {
            target.get(query, params, (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    };
}

/**
 * Promise-based wrapper around sqlite3.Database.run()
 */
function makeDbRun(db) {
    return function dbRun(query, params, overrideDb) {
        const target = overrideDb || db;
        return new Promise((resolve, reject) => {
            target.run(query, params, function (err) {
                if (err) return reject(err);
                resolve(this.lastID);
            });
        });
    };
}

/**
 * Promise-based wrapper around sqlite3.Database.all()
 */
function makeDbGetAll(db) {
    return function dbGetAll(query, params, overrideDb) {
        const target = overrideDb || db;
        return new Promise((resolve, reject) => {
            target.all(query, params, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    };
}

/**
 * Tables that hold user data and should be cleared between tests.
 * Excludes custom_polls because four default rows are seeded by the schema.
 */
const CLEARABLE_TABLES = [
    "users",
    "api_keys",
    "user_tokens",
    "refresh_tokens",
    "classroom",
    "classusers",
    "class_roles",
    "user_roles",
    "poll_answers",
    "poll_history",
    "shared_polls",
    "class_polls",
    "temp_user_creation_data",
    "used_authorization_codes",
    "ip_access_list",
    "links",
    "digipog_pools",
    "digipog_pool_users",
    "transactions",
    "notifications",
    "inventory",
    "item_registry",
    "trades",
    "apps",
    "app_redirect_uris",
    "oauth_grants",
];

/**
 * Creates and initializes an in-memory SQLite database.
 *
 * @returns {Promise<{
 *   db: sqlite3.Database,
 *   dbGet: Function,
 *   dbRun: Function,
 *   dbGetAll: Function,
 *   reset: () => Promise<void>,
 *   close: () => Promise<void>,
 * }>}
 */
async function createTestDb() {
    const schemaSQL = fs.readFileSync(SCHEMA_PATH, "utf8");
    const db = new sqlite3.Database(":memory:");

    // Apply the full schema
    await new Promise((resolve, reject) => {
        db.exec(schemaSQL, (err) => {
            if (err) return reject(err);
            resolve();
        });
    });

    const dbGet = makeDbGet(db);
    const dbRun = makeDbRun(db);
    const dbGetAll = makeDbGetAll(db);

    /**
     * Deletes all rows from every clearable table.
     * Re-inserts the four default custom_polls rows so tests that rely on
     * them don't need to set them up themselves.
     */
    async function reset() {
        for (const table of CLEARABLE_TABLES) {
            await new Promise((resolve, reject) => {
                db.run(`DELETE FROM "${table}"`, (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }

        // Delete custom roles (keep global built-in roles)
        await new Promise((resolve, reject) => {
            db.run(`DELETE FROM "roles" WHERE "isDefault" = 0 AND "id" NOT IN (SELECT "roleId" FROM "class_roles")`, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        // Reset SQLite auto-increment counters by deleting rows in sqlite_sequence
        await new Promise((resolve, reject) => {
            db.run(`DELETE FROM sqlite_sequence WHERE name IN (${CLEARABLE_TABLES.map(() => "?").join(",")})`, CLEARABLE_TABLES, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    /**
     * Closes the database connection.
     */
    function close() {
        return new Promise((resolve, reject) => {
            db.close((err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    return { db, dbGet, dbRun, dbGetAll, reset, close };
}

module.exports = { createTestDb };
