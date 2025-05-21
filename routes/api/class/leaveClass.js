const { createSocketFromHttp } = require("../../../modules/webServer");
const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { leaveClassroom } = require("../../../modules/class/class");

module.exports = {
    run(router) {
        // Leaves the classroom entirely
        // The user is no longer attached to the classroom
        router.post('/class/:id/leave', async (req, res) => {
            try {
                const hasPerms = await httpPermCheck("leaveClassroom", req, res);
                if (!hasPerms) {
                    return;
                }

                const socket = createSocketFromHttp(req, res);
                await leaveClassroom(socket)
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).send(`Error: ${err.message}`);
            }
        });
    }
}