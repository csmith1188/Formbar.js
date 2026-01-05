const { logger } = require("@modules/logger");
const { TEACHER_PERMISSIONS } = require("@modules/permissions");
const { hasClassPermission } = require("../../../../middleware/permissionCheck");
const { dbRun } = require("@modules/database");

module.exports = {
    run(router) {
        // Removes a link to a class by id
        router.post("/room/:id/links/remove", hasClassPermission(TEACHER_PERMISSIONS), async (req, res) => {
            try {
                const classId = req.params.id;
                const { name } = req.body;
                if (!name) {
                    res.status(400).json({ error: "Name is required." });
                    return;
                }

                // Remove the link from the database
                await dbRun("DELETE FROM links WHERE classId = ? AND name = ?", [classId, name]);
                res.status(200).json({ message: "Link removed successfully." });
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    },
};
