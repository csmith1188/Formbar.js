const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { leaveClass, leaveRoom } = require("../../../modules/class/class");

module.exports = {
    run(router) {
        // Leaves the current class session
        // The user is still attached to the classroom
        router.post('/class/:id/leave', httpPermCheck("leaveClass"), async (req, res) => {
            try {
                const result = leaveClass(socket);
                if (!result) {
                    return res.status(403).json({ message: 'Unauthorized' });
                }

                res.status(200).json({ message: 'Success' });
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}