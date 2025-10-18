const { logger } = require("../../../modules/logger");
const { httpPermCheck, hasClassPermission } = require("../../middleware/permissionCheck");
const { startClass } = require("../../../modules/class/class");
const { CLASS_PERMISSIONS } = require("../../../modules/permissions");

module.exports = {
    run(router) {
        // Starts a class session
        router.post("/class/:id/start", hasClassPermission(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
            try {
                const classId = req.params.id;
                startClass(classId);
                return res.json({ message: "Success" });
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({
                    error: `There was an internal server error. Please try again.`,
                });
            }
        });
    },
};
