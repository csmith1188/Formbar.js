const { createSocketFromHttp } = require("../../../modules/webServer");
const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { leaveClass, leaveClassroom } = require("../../../modules/class/class");

module.exports = {
    run(router) {
        // Leaves the current class session
        // The user is still attached to the classroom
        router.post('/class/:id/leaveSession', httpPermCheck("leaveClass"), async (req, res) => {
            try {
                const socket = createSocketFromHttp(req, res);
                leaveClass(socket);
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });

        // Leaves the classroom entirely
        // The user is no longer attached to the classroom
        router.post('/class/:id/leave', httpPermCheck("leaveClassroom"), async (req, res) => {
            try {
                const socket = createSocketFromHttp(req, res);
                await leaveClassroom(socket)
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}