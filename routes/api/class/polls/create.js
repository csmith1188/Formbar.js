const { createSocketFromHttp } = require("../../../../modules/webServer");
const { createPoll } = require("../../../../modules/polls");
const {userSocketUpdates} = require("../../../../sockets/init");

module.exports = {
    run(router) {
        // Creates a poll
        router.post('/class/:id/polls/create', async (req, res) => {
            let { resNumber, resTextBox, pollPrompt, polls, blind, weight, tags, boxes, indeterminate, multiRes } = req.body;
            polls = JSON.parse(polls);

            const socketUpdates = userSocketUpdates[req.session.user.email];
            const socket = createSocketFromHttp(req, res);
            await createPoll({ socketUpdates, resNumber, resTextBox, pollPrompt, polls, blind, weight, tags, boxes, indeterminate, multiRes }, socket);
        });
    }
}