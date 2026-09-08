// 43_assign_missing_app_pool_shares.js
// Assigns share item ids to pools that have shares but were created before the share_item column was created

const { dbGetAll, dbRun } = require("@modules/database");
module.exports = {
    async run(database) {
		//? For each app, ensure its pool has the share_item id

        const columns = await dbGetAll("PRAGMA table_info(digipog_pools)", [], database);
        const hasShareItemColumn = columns.some((column) => column.name === "share_item");
        if (!hasShareItemColumn) {
            await dbRun("ALTER TABLE digipog_pools ADD COLUMN share_item INTEGER DEFAULT NULL", [], database);
        }

        // Align each app's pool with its share item (idempotent: only fills missing values).
        await dbRun(
            "UPDATE digipog_pools SET share_item = (SELECT share_item_id FROM apps WHERE pool_id = digipog_pools.id LIMIT 1) WHERE share_item IS NULL AND id IN (SELECT pool_id FROM apps)",
            [],
            database
        );

		
    },
};
