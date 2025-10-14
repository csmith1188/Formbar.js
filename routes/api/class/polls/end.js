const { endPoll } = require("../../../../modules/polls");
const { logger } = require("../../../../modules/logger");
const { hasClassPermission } = require("../../../middleware/permissionCheck");
const { parseJson } = require("../../../middleware/parseJson");
const { CLASS_PERMISSIONS } = require("../../../../modules/permissions");

module.exports = {
    run(router) {
        // Ends the current poll for the class
        router.post('/class/:id/polls/end', hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), parseJson, async (req, res) => {
            try {
                const classId = req.params.id;
                await endPoll(classId, req.session.user);
                res.status(200).json({ message: 'Success' });
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}