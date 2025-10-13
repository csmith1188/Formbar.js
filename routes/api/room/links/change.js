const { logger } = require("../../../../modules/logger");
const { TEACHER_PERMISSIONS } = require("../../../../modules/permissions");
const { hasClassPermission } = require("../../../middleware/permissionCheck");
const { dbRun } = require("../../../../modules/database");

module.exports = {
    run(router) {
        // Changes a link in a room by id
        router.post('/room/:id/links/change', hasClassPermission(TEACHER_PERMISSIONS), async (req, res) => {
            try {
                const classId = req.params.id;
                const { oldName, name, url } = req.body;
                if (!name || !url) {
                    res.status(400).json({ error: "Name and URL are required." });
                    return;
                }

                // Update existing link; fallback to name match if oldName not provided
                if (oldName) {
                    await dbRun('UPDATE links SET name = ?, url = ? WHERE classId = ? AND name = ?', [name, url, classId, oldName]);
                } else {
                    await dbRun('UPDATE links SET url = ? WHERE classId = ? AND name = ?', [url, classId, name]);
                }
                res.status(200).json({ message: "Link updated successfully." });
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}