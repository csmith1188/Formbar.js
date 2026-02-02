const { createPoll } = require("@modules/polls");
const { hasClassPermission } = require("@middleware/permissionCheck");
const { parseJson } = require("@middleware/parseJson");
const { CLASS_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    // Creates a poll from the data provided
    router.post("/class/:id/polls/create", hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), parseJson, async (req, res) => {
        const classId = req.params.id;
        const body = req.body || {};
        const isLegacy =
            body.pollPrompt != null ||
            body.responseNumber != null ||
            body.polls != null ||
            body.blind != null ||
            body.responseTextBox != null ||
            body.multiRes != null;

        // Check if the request is legacy and remap them if so
        const pollData = isLegacy
            ? {
                  prompt: body.pollPrompt,
                  answers: Array.isArray(body.polls) ? body.polls : [],
                  blind: body.blind,
                  weight: body.weight,
                  tags: Array.isArray(body.tags) ? body.tags : (body.tags ?? []),
                  excludedRespondents: Array.isArray(body.boxes) ? body.boxes : undefined,
                  indeterminate: Array.isArray(body.indeterminate) ? body.indeterminate : [],
                  allowTextResponses: !!body.responseTextBox,
                  allowMultipleResponses: !!body.multiRes,
              }
            : body;

        await createPoll(classId, pollData, req.session.user);
        res.status(200).json({ success: true });
    });
};
