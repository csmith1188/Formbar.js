const { hasClassPermission } = require("@modules/middleware/permission-check");
const { isAuthenticated } = require("@modules/middleware/authentication");
const { endClass } = require("@services/class-service");
const { CLASS_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/end:
     *   post:
     *     summary: End a class session
     *     tags:
     *       - Class
     *     description: |
     *       Ends the current class session.
     *
     *       **Required Permission:** Class-specific `manageClass` permission (default: Teacher)
     *
     *       **Permission Levels:**
     *       - 1: Guest
     *       - 2: Student
     *       - 3: Moderator
     *       - 4: Teacher
     *       - 5: Manager
     *     security:
     *       - bearerAuth: []
     *       - sessionAuth: []
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
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: Insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post("/class/:id/end", isAuthenticated, hasClassPermission(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
        const classId = req.params.id;
        await endClass(classId, req.user);
        res.status(200).json({
            success: true,
            data: {},
        });
    });
};
