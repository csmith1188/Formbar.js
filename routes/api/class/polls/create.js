const { createPoll } = require("../../../../modules/polls");
const { logger } = require("../../../../modules/logger");
const { classPermCheck} = require("../../../middleware/permissionCheck");
const { parseJson } = require("../../../middleware/parseJson");
const { CLASS_PERMISSIONS } = require("../../../../modules/permissions");

module.exports = {
    run(router) {
        // Creates a poll from the data provided
        router.post('/class/:id/polls/create', classPermCheck(CLASS_PERMISSIONS.CONTROL_POLLS), parseJson, async (req, res) => {
            try {
                const classId = req.params.id;
                const body = req.body || {};
                const isLegacy = (
                    body.pollPrompt != null ||
                    body.responseNumber != null ||
                    body.polls != null ||
                    body.blind != null ||
                    body.responseTextBox != null ||
                    body.multiRes != null
                );

                // Check if the request is legacy and remap them if so
                const pollData = isLegacy ? {
                    prompt: body.pollPrompt,
                    answers: Array.isArray(body.polls) ? body.polls : [],
                    blind: body.blind,
                    weight: body.weight,
                    tags: Array.isArray(body.tags) ? body.tags : (body.tags ?? []),
                    studentsAllowedToVote: Array.isArray(body.boxes) ? body.boxes : undefined,
                    indeterminate: Array.isArray(body.indeterminate) ? body.indeterminate : [],
                    allowTextResponses: !!body.responseTextBox,
                    allowMultipleResponses: !!body.multiRes,
                } : body;

                await createPoll(classId, pollData, req.session.user);
                res.status(200).json({ message: 'Success' });
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}