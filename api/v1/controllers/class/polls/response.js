const { pollResponse } = require("@modules/polls");
const { logger } = require("@modules/logger");
const { httpPermCheck } = require("@modules/middleware/permissionCheck");
const { parseJson } = require("@modules/middleware/parseJson");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    // Responds to the current poll running in the class
    router.post("/class/:id/polls/response", httpPermCheck("pollResp"), parseJson, async (req, res) => {
        const { response, textRes } = req.body;
        const classId = req.params.id;
        await pollResponse(classId, response, textRes, req.session.user);
        res.status(200).json({ message: "Success" });
    });
};
