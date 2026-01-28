const { TEACHER_PERMISSIONS } = require("@modules/permissions");
const { hasClassPermission } = require("@modules/middleware/permissionCheck");
const { dbRun } = require("@modules/database");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    // Adds a link to a room by id
    router.post("/room/:id/links/add", hasClassPermission(TEACHER_PERMISSIONS), async (req, res) => {
        const classId = req.params.id;
        const { name, url } = req.body;
        if (!name || !url) {
            throw new ValidationError("Name and URL are required.");
        }

        // Add the link to the database
        await dbRun("INSERT INTO links (classId, name, url) VALUES (?, ?, ?)", [classId, name, url]);
        res.status(200).json({ message: "Link added successfully." });
    });
};
