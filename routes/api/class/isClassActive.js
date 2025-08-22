const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { isClassActive } = require("../../../modules/class/class");

module.exports = {
    run(router) {
        // Retrieves whether a class is currently active or not from the class ID provided
        router.get('/class/:id/active', httpPermCheck("isClassActive"), async (req, res) => {
            try {
                const classId = req.params.id;
                const isActive = isClassActive(classId);
                res.status(200).json({ isActive });
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}