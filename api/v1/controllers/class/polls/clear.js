const { clearPoll } = require("@modules/polls");
const { hasClassPermission } = require("@middleware/permissionCheck");
const { CLASS_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    // Clears the current poll for the class
    router.post("/class/:id/polls/clear", hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), async (req, res) => {
        const classId = req.params.id;
        await clearPoll(classId, req.session.user);
        res.status(200).json({ success: true });
    });
};
