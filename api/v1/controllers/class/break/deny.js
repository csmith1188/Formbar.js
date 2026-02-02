const { httpPermCheck } = require("@middleware/permissionCheck");
const { classInformation } = require("@modules/class/classroom");
const { approveBreak } = require("@modules/class/break");
const ForbiddenError = require("@errors/forbidden-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    // Denies a break in a class by class ID and user ID
    router.post("/class/:id/students/:userId/break/deny", httpPermCheck("approveBreak"), async (req, res) => {
        const classId = req.params.id;
        const classroom = classInformation.classrooms[classId];
        if (classroom && !classroom.students[req.session.email]) {
            throw new ForbiddenError("You do not have permission to approve this user's break.");
        }

        const result = approveBreak(false, req.params.userId, req.session.user);
        if (result === true) {
            res.status(200);
        } else {
            throw new AppError(result, 500);
        }
    });
};
