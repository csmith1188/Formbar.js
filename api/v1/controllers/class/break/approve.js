const { httpPermCheck } = require("@modules/middleware/permissionCheck");
const { classInformation } = require("@modules/class/classroom");
const { approveBreak } = require("@modules/class/break");
const ForbiddenError = require("@errors/forbidden-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    // Approves a break in a class by class ID and user ID
    router.get("/class/:id/students/:userId/break/approve", httpPermCheck("approveBreak"), async (req, res) => {
        const classId = req.params.id;
        const classroom = classInformation.classrooms[classId];
        if (classroom && !classroom.students[req.session.email]) {
            throw new ForbiddenError("You do not have permission to approve this user's break.");
        }

        const result = await approveBreak(true, req.params.userId, req.session.user);
        if (result === true) {
            res.status(200).json({ message: "Success" });
        } else {
            throw new AppError(result, 500);
        }
    });
};
