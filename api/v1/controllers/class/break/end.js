const { httpPermCheck } = require("@modules/middleware/permissionCheck");
const { classInformation } = require("@modules/class/classroom");
const { endBreak } = require("@modules/class/break");
const ForbiddenError = require("@errors/forbidden-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    // End a break in a class by class ID and user ID
    router.post("/class/:id/break/end", httpPermCheck("endBreak"), async (req, res) => {
        const classId = req.params.id;
        const classroom = classInformation.classrooms[classId];
        if (classroom && !classroom.students[req.session.email]) {
            throw new ForbiddenError("You do not have permission to end this user's break.");
        }

        const result = endBreak(req.session.user);
        if (result === true) {
            res.status(200).json({ success: true });
        } else {
            throw new AppError(result, 500);
        }
    });
};
