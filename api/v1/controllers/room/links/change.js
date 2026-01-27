const { TEACHER_PERMISSIONS } = require("@modules/permissions");
const { hasClassPermission } = require("@modules/middleware/permissionCheck");
const { dbRun } = require("@modules/database");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    // Changes a link in a room by id
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
