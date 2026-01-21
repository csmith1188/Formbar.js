const { logger } = require("@modules/logger");
const { GUEST_PERMISSIONS } = require("@modules/permissions");
const { hasClassPermission } = require("@modules/middleware/permissionCheck");
const { dbGetAll } = require("@modules/database");

module.exports = (router) => {
    // Retrieves all links for a class from the database
    router.get("/room/:id/links", hasClassPermission(GUEST_PERMISSIONS), async (req, res) => {
        const classId = req.params.id;
        const links = await dbGetAll("SELECT name, url FROM links WHERE classId = ?", [classId]);

        if (links) {
            res.status(200).json(links);
        }
    });
};
