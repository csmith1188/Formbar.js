const { hasClassPermission } = require("@modules/middleware/permission-check");
const { CLASS_PERMISSIONS } = require("@modules/permissions");
const { deleteHelpTicket } = require("@modules/class/help");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/students/{userId}/help/delete:
     *   get:
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
     *       - sessionAuth: []
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
    router.get("/class/:id/students/:userId/help/delete", hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), async (req, res) => {
        const result = await deleteHelpTicket(true, req.params.userId, req.session.user);
        if (result === true) {
            res.status(200).json({ success: true });
        } else {
            throw new AppError(result, 500);
        }
    });
};
