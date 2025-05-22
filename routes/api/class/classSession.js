const { createSocketFromHttp } = require("../../../modules/webServer");
const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { startClass, endClass} = require("../../../modules/class/class");

module.exports = {
    run(router) {
        // Starts a class session
        router.post('/class/:id/start', httpPermCheck("startClass"), async (req, res) => {
            try {
                const socket = createSocketFromHttp(req, res);
                startClass(socket);
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });

        // Ends the current class session
        router.post('/class/:id/end', httpPermCheck("endClass"), async (req, res) => {
            try {
                const socket = createSocketFromHttp(req, res);
                endClass(socket);
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}