const { hasClassPermission } = require("@modules/middleware/permission-check");
const { endClass } = require("@modules/class/class");
const { CLASS_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/end:
     *   post:
     *     summary: End a class session
     *     tags:
     *       - Class
     *     description: Ends the current class session (requires class management permissions)
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
     *     responses:
     *       200:
     *         description: Class session ended successfully
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
    router.post("/class/:id/end", hasClassPermission(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
        const classId = req.params.id;
        await endClass(classId, req.session.user);
        res.status(200).json({ success: true });
    });
};
