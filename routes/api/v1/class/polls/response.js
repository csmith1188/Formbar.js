const { pollResponse } = require("../../../../../modules/polls");
const { logger } = require("../../../../../modules/logger");
const { httpPermCheck } = require("../../../../middleware/permissionCheck");
const { parseJson } = require("../../../../middleware/parseJson");

module.exports = {
    run(router) {
        // Responds to the current poll running in the class
        router.post("/class/:id/polls/response", httpPermCheck("pollResp"), parseJson, async (req, res) => {
            try {
                const { response, textRes } = req.body;
                const classId = req.params.id;
                await pollResponse(classId, response, textRes, req.session.user);
                res.status(200).json({ message: "Success" });
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    },
};
