const { classInformation, getClassUsers } = require("../../../../modules/class")
const { getPollResponses, createPoll} = require("../../../../modules/polls")
const { TEACHER_PERMISSIONS } = require("../../../../modules/permissions")
const { logger } = require("../../../../modules/logger")

module.exports = {
    run(router) {
        // Creates a poll
        router.post('/class/:id/polls/create', async (req, res) => {
            const { resNumber, resTextBox, pollPrompt, polls, blind, weight, tags, boxes, indeterminate, multiRes } = req.body;
            await createPoll({ resNumber, resTextBox, pollPrompt, polls, blind, weight, tags, boxes, indeterminate, multiRes }, null, req);
        });
    }
}