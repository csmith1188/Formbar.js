const { logger } = require("@modules/logger");
const { hasPermission } = require("@modules/middleware/permission-check");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/manager/database/export:
     *   get:
     *     summary: Export database backup
     *     tags:
     *       - Manager
     *     description: Downloads a backup of the database (requires manager permissions)
     *     responses:
     *       200:
     *         description: Database backup file
     *         content:
     *           application/octet-stream:
     *             schema:
     *               type: string
     *               format: binary
     *       403:
     *         description: Insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.get("/manager/database/export", hasPermission(MANAGER_PERMISSIONS), (req, res) => {
        // Log the request details
        logger.log("info", `[get /manager/database/export] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
        res.download("database/database.db", "database.db");
    });
};
