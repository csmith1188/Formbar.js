const { createSocketFromHttp } = require("../../../../modules/webServer");
const { endPoll } = require("../../../../modules/polls");
const { logger } = require("../../../../modules/logger");

module.exports = {
    run(router) {
        // Ends the current poll for the class
        router.post('/class/:id/polls/end', async (req, res) => {
            try {
                const socket = createSocketFromHttp(req, res);
                await endPoll(socket);
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).send(`Error: ${err.message}`);
            }
        });
    }
}