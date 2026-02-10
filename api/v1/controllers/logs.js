const { getAllLogs, getLog } = require("@services/log-service");
const { logger } = require("@modules/logger");
const { hasPermission } = require("@middleware/permission-check");
const { isAuthenticated } = require("@middleware/authentication");
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
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
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
    router.get("/logs", isAuthenticated, hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        req.infoEvent("logs.view_all", `Viewing all logs`, { user: req.user?.email, ip: req.ip });
        const logs = await getAllLogs();
        res.json({
            success: true,
            data: {
                logs,
            },
        });
    });

    /**
     * @swagger
     * /api/v1/logs/{log}:
     *   get:
     *     summary: Get specific log file contents
     *     tags:
     *       - Logs
     *     description: Returns the contents of a specific log file
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
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
    router.get("/logs/:log", isAuthenticated, hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        const logFileName = req.params.log;
        req.infoEvent("logs.view_single", `Viewing log: ${logFileName}`, { user: req.user?.email, ip: req.ip, logFileName });
        const text = await getLog(logFileName);
        res.json({
            success: true,
            data: {
                text,
            },
        });
    });
};
