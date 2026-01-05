const { clearPoll } = require("@modules/polls");
const { logger } = require("@modules/logger");
const { hasClassPermission } = require("../../middleware/permissionCheck");
const { CLASS_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    try {
        // Clears the current poll for the class
        router.post("/class/:id/polls/clear", hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), async (req, res) => {
            try {
                const classId = req.params.id;
                await clearPoll(classId, req.session.user);
                res.status(200).json({ message: "Success" });
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
}
