const { dbGetAll } = require("../../../modules/database");
module.exports = {
    async run(database) {
        const uniqueColumns = await dbGetAll("PRAGMA index_list(refresh_tokens)", [], database);
        if (uniqueColumns.length > 0) {
            const refreshTokens = await dbGetAll("SELECT * FROM refresh_tokens", [], database);
            const seenTokens = new Set();
            for (const token of refreshTokens) {
                console.log(token)
                if (seenTokens.has(token.refresh_token)) {
                    console.log('duplicate found')
                    // await database.run("DELETE FROM refresh_tokens WHERE id = ?", [token.id]);
                } else {
                    seenTokens.add(token.refresh_token);
                }
            }
        } else {
            throw new Error("ALREADY_DONE"); // Throw an error for migrate.js to catch and identify this migration as already run
        }
    },
};
