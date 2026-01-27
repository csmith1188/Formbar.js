const { logger } = require("@modules/logger");
const { hasPermission } = require("@modules/middleware/permission-check");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    router.get("/manager/database/export", hasPermission(MANAGER_PERMISSIONS), (req, res) => {
        // Log the request details
        logger.log("info", `[get /manager/database/export] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
        res.download("database/database.db", "database.db");
    });
};
