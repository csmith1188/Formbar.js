const { permCheck, isAuthenticated } = require("@controllers/middleware/authentication");
const { getAllLogs, getLog } = require("@services/log-service");
const { logger } = require("@modules/logger");
const fs = require("fs");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/logs:
     *   get:
     *     summary: Get all available logs
     *     tags:
     *       - Logs
     *     description: Returns a list of all available log files
     *     responses:
     *       200:
     *         description: List of logs retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 logs:
     *                   type: array
     *                   items:
     *                     type: string
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    // Handle displaying all logs to the manager
    router.get("/logs", async (req, res) => {
        try {
            logger.log("info", `[get /logs] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
            const logs = await getAllLogs();
            res.json({ logs });
        } catch (err) {
            res.status(500).json({ error: `Failed to retrieve logs: ${err.message}` });
        }
    });

    /**
     * @swagger
     * /api/v1/logs/{log}:
     *   get:
     *     summary: Get specific log file contents
     *     tags:
     *       - Logs
     *     description: Returns the contents of a specific log file
     *     parameters:
     *       - in: path
     *         name: log
     *         required: true
     *         description: The name of the log file to retrieve
     *         schema:
     *           type: string
     *           example: "application-info-2026-01-20-13.log"
     *     responses:
     *       200:
     *         description: Log contents retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 text:
     *                   type: string
     *       404:
     *         description: Log file not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     */
    // Handle displaying a specific log to the manager
    router.get("/logs/:log", async (req, res) => {
        const logFileName = req.params.log;
        try {
            logger.log("info", `[get /logs/:log] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
            const text = await getLog(logFileName);
            res.json({ text });
        } catch (err) {
            res.status(404).json({ error: `Log file not found: ${err.message}` });
        }
    });
};
