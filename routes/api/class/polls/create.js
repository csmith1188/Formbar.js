const { createSocketFromHttp } = require("../../../../modules/webServer");
const { createPoll } = require("../../../../modules/polls");
const { logger } = require("../../../../modules/logger");

module.exports = {
    run(router) {
        // Creates a poll from the data provided
        router.post('/class/:id/polls/create', async (req, res) => {
            try {
                let { resNumber, resTextBox, pollPrompt, polls, blind, weight, tags, boxes, indeterminate, multiRes } = req.body;
                polls = JSON.parse(polls);

                const socket = createSocketFromHttp(req, res);
                await createPoll({ resNumber, resTextBox, pollPrompt, polls, blind, weight, tags, boxes, indeterminate, multiRes }, socket);
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).send(`Error: ${err.message}`);
            }
        });
    }
}