// 06_remove_old_apps_table.js
// Ensures the apps table is old before removing

const { dbGetAll, dbRun } = require("@modules/database");
module.exports = {
    async run(database) {
		//? Check if apps table has the "full" column,
		//? Which is only in the original "apps" table

        const appColumns = await dbGetAll("PRAGMA table_info(apps)", [], database);
		
		if(appColumns.some((column) => column.name === "full")) {
			await dbRun("DROP TABLE apps", [], database);
		} else {
			throw new Error("ALREADY_DONE");
		}
		
    },
};
