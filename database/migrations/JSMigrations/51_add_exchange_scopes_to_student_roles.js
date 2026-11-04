const { dbGetAll, dbRun } = require("@modules/database");
const { ROLE_NAMES } = require("@modules/roles");
const { SCOPES } = require("@modules/scopes");

/**
 * Parse a stored role scope list into string scope names.
 *
 * @param {unknown} value - Stored role scopes.
 * @returns {string[]} The valid scope names in the stored value.
 */
function parseScopes(value) {
    if (Array.isArray(value)) {
        return value.filter((scope) => typeof scope === "string");
    }

    if (typeof value !== "string" || !value.trim()) {
        return [];
    }

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((scope) => typeof scope === "string") : [];
    } catch {
        return [];
    }
}

/**
 * Add a scope to each named role that does not already have it.
 *
 * @param {import("sqlite3").Database} database - Database connection.
 * @param {string[]} roleNames - Role names to update.
 * @param {string} scope - Scope to add.
 * @returns {Promise<void>}
 */
async function appendScopeToNamedRoles(database, roleNames, scope) {
    const placeholders = roleNames.map(() => "?").join(", ");
    const rows = await dbGetAll(`SELECT id, scopes FROM roles WHERE name IN (${placeholders})`, roleNames, database);

    for (const row of rows) {
        const scopes = parseScopes(row.scopes);
        if (scopes.includes(scope)) {
            continue;
        }

        scopes.push(scope);
        await dbRun("UPDATE roles SET scopes = ? WHERE id = ?", [JSON.stringify(scopes), row.id], database);
    }
}

module.exports = {
    async run(database) {
        const studentAndHigherRoles = [ROLE_NAMES.STUDENT, ROLE_NAMES.MOD, ROLE_NAMES.TEACHER, ROLE_NAMES.MANAGER];
        const exchangeScopes = [SCOPES.GLOBAL.EXCHANGES.ACCEPT, SCOPES.GLOBAL.EXCHANGES.CREATE];

        for (const scope of exchangeScopes) {
            await appendScopeToNamedRoles(database, studentAndHigherRoles, scope);
        }

        console.log("Migration 51 completed: exchange scopes backfilled for student and higher roles.");
    },
};
