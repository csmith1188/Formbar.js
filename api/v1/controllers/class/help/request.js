const { httpPermCheck } = require("@modules/middleware/permissionCheck");
const { classInformation } = require("@modules/class/classroom");
const { sendHelpTicket } = require("@modules/class/help");
const ForbiddenError = require("@errors/forbidden-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    // request help in a class by class ID
    router.get("/class/:id/help/request", httpPermCheck("help"), async (req, res) => {
        const classId = req.params.id;
        const classroom = classInformation.classrooms[classId];
        if (classroom && !classroom.students[req.session.email]) {
            throw new ForbiddenError("You do not have permission to request help in this class.");
        }

        const result = await sendHelpTicket(true, req.params.userId, req.session.user);
        if (result === true) {
            res.status(200).json({ message: "Success" });
        } else {
            throw new AppError(result, 500);
        }
    });
};
