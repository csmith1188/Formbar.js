const { TEACHER_PERMISSIONS } = require("@modules/permissions");
const { dbRun } = require("@modules/database");
const { hasClassPermission } = require("@modules/middleware/permissionCheck");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    // Removes a link to a class by id
    router.post("/room/:id/links/remove", hasClassPermission(TEACHER_PERMISSIONS), async (req, res) => {
        const classId = req.params.id;
        const { name } = req.body;
        if (!name) {
            throw new ValidationError("Name is required.");
        }

        // Remove the link from the database
        await dbRun("DELETE FROM links WHERE classId = ? AND name = ?", [classId, name]);
        res.status(200).json({ message: "Link removed successfully." });
    });
};
