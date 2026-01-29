const { classInformation } = require("@modules/class/classroom");
const { logger } = require("@modules/logger");
const NotFoundError = require("@errors/not-found-error");
const ForbiddenError = require("@errors/forbidden-error");

module.exports = (router) => {
    // Gets the permissions of a class
    router.get("/class/:id/permissions", async (req, res) => {
        // Get the class key from the request parameters and log the request details
        let classId = req.params.id;

        // Get a clone of the class data
        // If the class does not exist, return an error
        let classData = structuredClone(classInformation.classrooms[classId]);
        if (!classData) {
            throw new NotFoundError("Class not started");
        }

        // Get the user from the session
        // If the user is not in the class, return an error
        const user = req.session.user;
        if (!classData.students[user.email]) {
            throw new ForbiddenError("User is not logged into the selected class");
        }

        // Send the class permissions as a JSON response
        res.status(200).json(classData.permissions);
    });
};
