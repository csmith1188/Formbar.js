const { createSocketFromHttp } = require("../../../modules/webServer");
const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { endClass } = require("../../../modules/class/class");

module.exports = {
    run(router) {
        // Ends the current class session
        router.post('/class/:id/end', async (req, res) => {
            try {
                const hasPerms = await httpPermCheck("endClass", req, res);
                if (!hasPerms) {
                    return;
                }

                const socket = createSocketFromHttp(req, res);
                endClass(socket);
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).send(`Error: ${err.message}`);
            }
        });
    }
}