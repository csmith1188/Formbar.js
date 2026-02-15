const { TEACHER_PERMISSIONS } = require("@modules/permissions");
const { hasClassPermission } = require("@middleware/permission-check");
const { dbRun } = require("@modules/database");
const { isAuthenticated } = require("@middleware/authentication");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    const changeLinkHandler = async (req, res) => {
        const classId = req.params.id;
        const { oldName, name, url } = req.body;
        req.infoEvent("room.links.update.attempt", "Attempting to update room link", { classId, linkName: name, oldLinkName: oldName || null });
        if (!name || !url) {
            throw new ValidationError("Name and URL are required.");
        }

        // Update existing link; fallback to name match if oldName not provided
        if (oldName) {
            await dbRun("UPDATE links SET name = ?, url = ? WHERE classId = ? AND name = ?", [name, url, classId, oldName]);
        } else {
            await dbRun("UPDATE links SET url = ? WHERE classId = ? AND name = ?", [url, classId, name]);
        }
        req.infoEvent("room.links.update.success", "Room link updated", { classId, linkName: name, oldLinkName: oldName || null });
        res.status(200).json({
            success: true,
            data: {
                message: "Link updated successfully.",
            },
        });
    };

    /**
     * @swagger
     * /api/v1/room/{id}/links:
     *   put:
     *     summary: Update a link in a room
     *     tags:
     *       - Room - Links
     *     description: Updates an existing link in a classroom (requires teacher permissions)
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
     *               - url
     *             properties:
     *               oldName:
     *                 type: string
     *                 example: "Old Course Website"
     *                 description: Original name of the link (optional, for renaming)
     *               name:
     *                 type: string
     *                 example: "Course Website"
     *               url:
     *                 type: string
     *                 example: "https://example.com"
     *     responses:
     *       200:
     *         description: Link updated successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                   example: "Link updated successfully."
     *       400:
     *         description: Name and URL are required
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
    router.put("/room/:id/links", isAuthenticated, hasClassPermission(TEACHER_PERMISSIONS), changeLinkHandler);

    // Deprecated endpoint - kept for backwards compatibility, use PUT /api/v1/room/:id/links instead
    router.post("/room/:id/links/change", isAuthenticated, hasClassPermission(TEACHER_PERMISSIONS), async (req, res) => {
        res.setHeader("X-Deprecated", "Use PUT /api/v1/room/:id/links instead");
        res.setHeader(
            "Warning",
            '299 - "Deprecated API: Use PUT /api/v1/room/:id/links instead. This endpoint will be removed in a future version."'
        );
        await changeLinkHandler(req, res);
    });
};
