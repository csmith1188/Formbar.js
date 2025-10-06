const { logger } = require("../../../../modules/logger");
const { TEACHER_PERMISSIONS } = require("../../../../modules/permissions");
const { classPermCheck } = require("../../../middleware/permissionCheck");
const { dbRun } = require("../../../../modules/database");

module.exports = {
    run(router) {
        // Adds a link to a class by id
        router.post('/class/:id/links/add', classPermCheck(TEACHER_PERMISSIONS), async (req, res) => {
            try {
                const classId = req.params.id;
                const { name, url } = req.body;
                if (!name || !url) {
                    res.status(400).json({ error: "Name and URL are required." });
                    return;
                }

                // Add the link to the database
                await dbRun('INSERT INTO links (classId, name, url) VALUES (?, ?, ?)', [classId, name, url]);
                res.status(200).json({ message: "Link added successfully." });
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}