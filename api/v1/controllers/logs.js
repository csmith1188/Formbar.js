const { getAllLogs, getLog } = require("@services/log-service");
const { logger } = require("@modules/logger");
const { hasPermission } = require("@middleware/permissionCheck");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    // Handle displaying all logs to the manager
    router.get("/logs", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        const logs = await getAllLogs();
        res.json({ logs });
    });

    // Handle displaying a specific log to the manager
    router.get("/logs/:log", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        const logFileName = req.params.log;
        const text = await getLog(logFileName);
        res.json({ text });
    });
};
