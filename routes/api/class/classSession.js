const { logger } = require("../../../modules/logger");
const { httpPermCheck, classPermCheck } = require("../../middleware/permissionCheck");
const { startClass, endClass } = require("../../../modules/class/class");
const { CLASS_PERMISSIONS } = require("../../../modules/permissions");

module.exports = {
    run(router) {
        // Starts a class session
        router.post('/class/:id/start', httpPermCheck("startClass"), classPermCheck(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
            try {
                const classId = req.params.id
                startClass(classId);
                return res.json({ message: 'Success' });
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });

        // Ends the current class session
        router.post('/class/:id/end', httpPermCheck("endClass"), classPermCheck(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
            try {
                const classId = req.params.id;
                endClass(classId);
                return res.json({ message: 'Success' });
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}