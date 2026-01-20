const { logger } = require("@modules/logger");
const { GUEST_PERMISSIONS } = require("@modules/permissions");
const { hasClassPermission } = require("../../middleware/permission-check");
const { dbGetAll } = require("@modules/database");

module.exports = (router) => {
    try {
        // Retrieves all links for a class from the database
        router.get("/room/:id/links", hasClassPermission(GUEST_PERMISSIONS), async (req, res) => {
            try {
                const classId = req.params.id;
                const links = await dbGetAll("SELECT name, url FROM links WHERE classId = ?", [classId]);

                if (links) {
                    res.status(200).json(links);
                }
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
