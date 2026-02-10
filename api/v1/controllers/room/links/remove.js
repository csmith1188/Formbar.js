const { TEACHER_PERMISSIONS } = require("@modules/permissions");
const { dbRun } = require("@modules/database");
const { hasClassPermission } = require("@modules/middleware/permission-check");
const { isAuthenticated } = require("@modules/middleware/authentication");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    const removeLinkHandler = async (req, res) => {
        const classId = req.params.id;
        const { name } = req.body;
        if (!name) {
            throw new ValidationError("Name is required.");
        }

        // Remove the link from the database
        await dbRun("DELETE FROM links WHERE classId = ? AND name = ?", [classId, name]);
        res.status(200).json({
            success: true,
            data: {
                message: "Link removed successfully.",
            },
        });
    };

    /**
     * @swagger
     * /api/v1/room/{id}/links:
     *   delete:
     *     summary: Remove a link from a room
     *     tags:
     *       - Room - Links
     *     description: Removes a link from a classroom (requires teacher permissions)
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
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - name
     *             properties:
     *               name:
     *                 type: string
     *                 example: "Course Website"
     *     responses:
     *       200:
     *         description: Link removed successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                   example: "Link removed successfully."
     *       400:
     *         description: Name is required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       403:
     *         description: Insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.delete("/room/:id/links", isAuthenticated, hasClassPermission(TEACHER_PERMISSIONS), removeLinkHandler);

    // Deprecated endpoint - kept for backwards compatibility, use DELETE /api/v1/room/:id/links instead
    router.post("/room/:id/links/remove", isAuthenticated, hasClassPermission(TEACHER_PERMISSIONS), async (req, res) => {
        res.setHeader("X-Deprecated", "Use DELETE /api/v1/room/:id/links instead");
        res.setHeader(
            "Warning",
            '299 - "Deprecated API: Use DELETE /api/v1/room/:id/links instead. This endpoint will be removed in a future version."'
        );
        await removeLinkHandler(req, res);
    });
};
