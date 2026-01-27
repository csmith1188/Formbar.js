const { TEACHER_PERMISSIONS } = require("@modules/permissions");
const { hasClassPermission } = require("@modules/middleware/permission-check");
const { dbRun } = require("@modules/database");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/room/{id}/links/change:
     *   post:
     *     summary: Update a link in a room
     *     tags:
     *       - Room - Links
     *     description: Updates an existing link in a classroom (requires teacher permissions)
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
    router.post("/room/:id/links/change", hasClassPermission(TEACHER_PERMISSIONS), async (req, res) => {
        const classId = req.params.id;
        const { oldName, name, url } = req.body;
        if (!name || !url) {
            throw new ValidationError("Name and URL are required.");
        }

        // Update existing link; fallback to name match if oldName not provided
        if (oldName) {
            await dbRun("UPDATE links SET name = ?, url = ? WHERE classId = ? AND name = ?", [name, url, classId, oldName]);
        } else {
            await dbRun("UPDATE links SET url = ? WHERE classId = ? AND name = ?", [url, classId, name]);
        }
        res.status(200).json({ message: "Link updated successfully." });
    });
};
