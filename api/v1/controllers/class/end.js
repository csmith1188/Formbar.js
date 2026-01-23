const { logger } = require("@modules/logger");
const { hasClassPermission } = require("@modules/middleware/permissionCheck");
const { endClass } = require("@modules/class/class");
const { CLASS_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    try {
        // Ends the current class session
        router.post("/class/:id/end", hasClassPermission(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
            const classId = req.params.id;
            endClass(classId, req.session.user);
            res.status(200).json({ message: "Success" });
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
