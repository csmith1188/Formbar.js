const { hasClassPermission } = require("@modules/middleware/permission-check");
const { startClass } = require("@modules/class/class");
const { CLASS_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/start:
     *   post:
     *     summary: Start a class session
     *     tags:
     *       - Class
     *     description: Starts a class session (requires class management permissions)
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
     *     responses:
     *       200:
     *         description: Class session started successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       403:
     *         description: Insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post("/class/:id/start", hasClassPermission(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
        const classId = req.params.id;
        await startClass(classId);
        return res.json({ success: true });
    });
};
