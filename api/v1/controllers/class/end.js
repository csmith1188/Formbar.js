const { logger } = require("@modules/logger");
const { hasClassPermission } = require("../middleware/permissionCheck");
const { endClass } = require("@modules/class/class");
const { CLASS_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    try {
        // Ends the current class session
        router.post("/class/:id/end", hasClassPermission(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
            try {
                const classId = req.params.id;
                endClass(classId, req.session.user);
                res.status(200).json({ message: "Success" });
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
