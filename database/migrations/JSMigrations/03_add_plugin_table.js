const { dbGet } = require("../../../modules/database");
module.exports = {
    async run(database) {
        const plugins = await dbGet('PRAGMA table_info(plugins)');
        console.log(plugins)
    }
}