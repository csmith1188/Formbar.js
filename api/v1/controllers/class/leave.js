const { httpPermCheck } = require("@middleware/permissionCheck");
const { leaveClass } = require("@modules/class/class");
const ForbiddenError = require("@errors/forbidden-error");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    // Leaves the current class session
    // The user is still attached to the classroom
    router.post("/class/:id/leave", httpPermCheck("leaveClass"), async (req, res) => {
        const classId = req.params.id;

        // Validate that classId is provided
        if (!classId) {
            throw new ValidationError("Class ID is required.", { event: "class.leave.failed", reason: "missing_class_id" });
        }

        const result = leaveClass(req.session, req.params.id);
        if (!result) {
            throw new ForbiddenError("Unauthorized", { event: "class.leave.failed", reason: "unauthorized" });
        }

        res.status(200).json({ success: true });
    });
};
