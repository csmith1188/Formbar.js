const { createSocketFromHttp } = require("../../../../modules/webServer");
const { clearPoll } = require("../../../../modules/polls");
const { logger } = require("../../../../modules/logger");
const { httpPermCheck } = require("../../../middleware/permissionCheck");
const { parseJson } = require("../../../middleware/parseJson");

module.exports = {
    run(router) {
        // Clears the current poll for the class
        router.post('/class/:id/polls/clear', httpPermCheck('clearPoll'), parseJson, async (req, res) => {
            try {
                const socket = createSocketFromHttp(req, res);
                await clearPoll(socket);
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}