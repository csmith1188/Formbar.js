const { hasClassPermission } = require("@middleware/permissionCheck");
const { startClass } = require("@modules/class/class");
const { CLASS_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    // Starts a class session
    router.post("/class/:id/start", hasClassPermission(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
        const classId = req.params.id;
        await startClass(classId);
        return res.json({ success: true });
    });
};
