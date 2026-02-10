const { hasClassPermission } = require("@modules/middleware/permission-check");
const { CLASS_PERMISSIONS } = require("@modules/permissions");
const { deleteHelpTicket } = require("@modules/class/help");
const { isAuthenticated } = require("@modules/middleware/authentication");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    const deleteHelpHandler = async (req, res) => {
        const userData = { ...req.user, classId: req.params.id };
        const result = await deleteHelpTicket(req.params.userId, userData);
        if (result === true) {
            res.status(200).json({
                success: true,
                data: {},
            });
        } else {
            throw new AppError(result, 500);
        }
    };

    /**
     * @swagger
     * /api/v1/class/{id}/students/{userId}/help:
     *   delete:
     *     summary: Delete a help request
     *     tags:
     *       - Class - Help
     *     description: |
     *       Deletes a help request from a class.
     *
     *       **Required Permission:** Class-specific `controlPoll` permission (default: Moderator)
     *
     *       **Permission Levels:**
     *       - 1: Guest
     *       - 2: Student
     *       - 3: Moderator
     *       - 4: Teacher
     *       - 5: Manager
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
     *       - in: path
     *         name: userId
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the user whose help request to delete
     *     responses:
     *       200:
     *         description: Help request deleted successfully
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
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.delete("/class/:id/students/:userId/help", isAuthenticated, hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), deleteHelpHandler);

    // Deprecated endpoint - kept for backwards compatibility, use DELETE /api/v1/class/:id/students/:userId/help instead
    router.get("/class/:id/students/:userId/help/delete", isAuthenticated, hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), async (req, res) => {
        res.setHeader("X-Deprecated", "Use DELETE /api/v1/class/:id/students/:userId/help instead");
        res.setHeader(
            "Warning",
            '299 - "Deprecated API: Use DELETE /api/v1/class/:id/students/:userId/help instead. This endpoint will be removed in a future version."'
        );
        await deleteHelpHandler(req, res);
    });
};
