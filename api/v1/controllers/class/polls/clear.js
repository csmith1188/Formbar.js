const { clearPoll } = require("@modules/polls");
const { logger } = require("@modules/logger");
const { hasClassPermission } = require("@modules/middleware/permissionCheck");
const { CLASS_PERMISSIONS } = require("@modules/permissions");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    // Clears the current poll for the class
    router.post("/class/:id/polls/clear", hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), async (req, res) => {
        const classId = req.params.id;
        await clearPoll(classId, req.session.user);
        res.status(200).json({ message: "Success" });
    });
};
