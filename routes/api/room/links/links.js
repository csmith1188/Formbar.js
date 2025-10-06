const { logger } = require("../../../../modules/logger");
const { GUEST_PERMISSIONS } = require("../../../../modules/permissions");
const { classPermCheck } = require("../../../middleware/permissionCheck");
const { dbGet } = require("../../../../modules/database");

module.exports = {
    run(router) {
        // Retrieves all links for a class from the database
        router.get('/room/:id/links', classPermCheck(GUEST_PERMISSIONS), async (req, res) => {
            try {
                const classId = req.params.id;
                const links = await dbGet('SELECT name, url FROM links WHERE classId = ?', [classId]);
                res.status(200).json(links);
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}