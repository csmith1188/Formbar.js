const { logger } = require("../../../modules/logger");
const { classPermCheck } = require("../../middleware/permissionCheck");
const { endClass } = require("../../../modules/class/class");
const { CLASS_PERMISSIONS } = require("../../../modules/permissions");

module.exports = {
    run(router) {
        // Ends the current class session
        router.post('/class/:id/end', classPermCheck(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
            try {
                const classId = req.params.id;
                endClass(classId);
                res.status(200).json({ message: 'Success' });
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}