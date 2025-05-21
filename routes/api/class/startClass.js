const { createSocketFromHttp } = require("../../../modules/webServer");
const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { startClass } = require("../../../modules/class/class");

module.exports = {
    run(router) {
        // Starts a class session
        router.post('/class/:id/start', async (req, res) => {
            try {
                const hasPerms = await httpPermCheck("startClass", req, res);
                if (!hasPerms) {
                    return;
                }

                const socket = createSocketFromHttp(req, res);
                startClass(socket);
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).send(`Error: ${err.message}`);
            }
        });
    }
}