const { permCheck, isAuthenticated } = require("@modules/middleware/authentication");
const { getAllLogs, getLog } = require("@services/log-service");
const { logger } = require("@modules/logger");
const fs = require("fs");
const AppError = require("@errors/app-error");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    // Handle displaying all logs to the manager
    router.get("/logs", async (req, res) => {
        logger.log("info", `[get /logs] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
        const logs = await getAllLogs();
        res.json({ logs });
    });

    // Handle displaying a specific log to the manager
    router.get("/logs/:log", async (req, res) => {
        const logFileName = req.params.log;
        logger.log("info", `[get /logs/:log] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
        const text = await getLog(logFileName);
        res.json({ text });
    });
};
