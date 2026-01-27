const { getAllLogs, getLog } = require("@services/log-service");
const { logger } = require("@modules/logger");
const { hasPermission } = require("@modules/middleware/permissionCheck");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");

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
    router.get("/logs", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        logger.log("info", `[get /logs] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
        const logs = await getAllLogs();
        res.json({ logs });
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
    router.get("/logs/:log", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        const logFileName = req.params.log;
        logger.log("info", `[get /logs/:log] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
        const text = await getLog(logFileName);
        res.json({ text });
    });
};
