const { httpPermCheck } = require("@modules/middleware/permissionCheck");
const { classInformation } = require("@modules/class/classroom");
const { requestBreak } = require("@modules/class/break");
const ForbiddenError = require("@errors/forbidden-error");
const ValidationError = require("@errors/validation-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    // Request a break in a class by class ID and user ID
    router.post("/class/:id/break/request", httpPermCheck("requestBreak"), async (req, res) => {
        const classId = req.params.id;
        const classroom = classInformation.classrooms[classId];
        if (classroom && !classroom.students[req.session.email]) {
            throw new ForbiddenError("You do not have permission to request a break.");
        }

        if (!req.body.reason) {
            throw new ValidationError("A reason for the break must be provided.");
        }

        const result = requestBreak(req.body.reason, req.session.user);
        if (result === true) {
            res.status(200);
        } else {
            throw new AppError(result, 500);
        }
    });
};
