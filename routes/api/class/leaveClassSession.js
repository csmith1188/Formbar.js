const { createSocketFromHttp } = require("../../../modules/webServer");
const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { leaveClass } = require("../../../modules/class/class");

module.exports = {
    run(router) {
        // Leaves the current class session
        // The user is still attached to the classroom
        router.post('/class/:id/leaveSession', async (req, res) => {
            try {
                const hasPerms = await httpPermCheck("leaveClass", req, res);
                if (!hasPerms) {
                    return;
                }

                const socket = createSocketFromHttp(req, res);
                leaveClass(socket);
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).send(`Error: ${err.message}`);
            }
        });
    }
}