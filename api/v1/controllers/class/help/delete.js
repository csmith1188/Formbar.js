const { hasClassPermission } = require("@middleware/permissionCheck");
const { CLASS_PERMISSIONS } = require("@modules/permissions");
const { deleteHelpTicket } = require("@modules/class/help");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    // Deletes a help ticket in a class by class ID and user ID
    router.get("/class/:id/students/:userId/help/delete", hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), async (req, res) => {
        const result = await deleteHelpTicket(true, req.params.userId, req.session.user);
        if (result === true) {
            res.status(200).json({ success: true });
        } else {
            throw new AppError(result, { statusCode: 500, event: "class.help.delete.failed", reason: "delete_error" });
        }
    });
};
