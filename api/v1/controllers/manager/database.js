const { logger } = require("@modules/logger");
const { hasPermission } = require("@modules/middleware/permissionCheck");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    router.get("/manager/database/export", hasPermission(MANAGER_PERMISSIONS), (req, res) => {
        // Log the request details
        res.download("database/database.db", "database.db");
    });
};
