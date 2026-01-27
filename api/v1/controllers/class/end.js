const { hasClassPermission } = require("@modules/middleware/permissionCheck");
const { endClass } = require("@modules/class/class");
const { CLASS_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    // Ends the current class session
    router.post("/class/:id/end", hasClassPermission(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
        const classId = req.params.id;
        await endClass(classId, req.session.user);
        res.status(200).json({ success: true });
    });
};
