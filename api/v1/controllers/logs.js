const { permCheck, isAuthenticated } = require("@controllers/middleware/authentication");
const { getAllLogs, getLog } = require("@services/log-service");
const { logger } = require("@modules/logger");
const fs = require("fs");

module.exports = (router) => {
    // Handle displaying all logs to the manager
    router.get("/logs", async (req, res) => {
        try {
            logger.log("info", `[get /logs] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
            const logs = await getAllLogs();
            res.json({logs});
        } catch (err) {
            res.status(500).json({ error: `Failed to retrieve logs: ${err.message}` });
        }
    });

    // Handle displaying a specific log to the manager
    router.get("/logs/:log", async (req, res) => {
        const logFileName = req.params.log;
        try {
            logger.log("info", `[get /logs/:log] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
            const text = await getLog(logFileName);
            res.json({text});
        } catch (err) {
            res.status(404).json({ error: `Log file not found: ${err.message}` });
        }
    });
};
