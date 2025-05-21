const { createSocketFromHttp } = require("../../../../modules/webServer");
const { clearPoll } = require("../../../../modules/polls");
const { logger } = require("../../../../modules/logger");
const { httpPermCheck } = require("../../../middleware/permissionCheck");

module.exports = {
    run(router) {
        // Clears the current poll for the class
        router.post('/class/:id/polls/clear', async (req, res) => {
            try {
                const hasPerms = await httpPermCheck("clearPoll", req, res);
                if (!hasPerms) {
                    return;
                }

                const socket = createSocketFromHttp(req, res);
                await clearPoll(socket);
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).send(`Error: ${err.message}`);
            }
        });
    }
}