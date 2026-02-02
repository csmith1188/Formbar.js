const { httpPermCheck } = require("@middleware/permissionCheck");
const { isClassActive } = require("@modules/class/class");
const { classInformation } = require("@modules/class/classroom");
const ForbiddenError = require("@errors/forbidden-error");

module.exports = (router) => {
    // Retrieves whether a class is currently active or not from the class ID provided
    router.get("/class/:id/active", httpPermCheck("isClassActive"), async (req, res) => {
        const classId = req.params.id;
        const classroom = classInformation.classrooms[classId];
        if (classroom && !classroom.students[req.session.email]) {
            throw new ForbiddenError("You do not have permission to view the status of this class.");
        }

        const isActive = isClassActive(classId);
        res.status(200).json({ isActive });
    });
};
