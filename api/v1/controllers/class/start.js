const { logger } = require("@modules/logger");
const { httpPermCheck, hasClassPermission } = require("@modules/middleware/permissionCheck");
const { startClass } = require("@modules/class/class");
const { CLASS_PERMISSIONS } = require("@modules/permissions");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    // Starts a class session
    router.post("/class/:id/start", hasClassPermission(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
        const classId = req.params.id;
        startClass(classId);
        return res.json({ message: "Success" });
    });
};
