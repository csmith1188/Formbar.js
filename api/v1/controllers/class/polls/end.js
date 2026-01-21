const { logger } = require("@modules/logger");
const { hasClassPermission } = require("@modules/middleware/permissionCheck");
const { parseJson } = require("@modules/middleware/parseJson");
const { CLASS_PERMISSIONS } = require("@modules/permissions");
const { updatePoll } = require("@modules/polls");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    // Ends the current poll for the class
    router.post("/class/:id/polls/end", hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), parseJson, async (req, res) => {
        const classId = req.params.id;
        await updatePoll(classId, { status: false }, req.session);
        res.status(200).json({ message: "Success" });
    });
};
