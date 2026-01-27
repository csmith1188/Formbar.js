const { classInformation } = require("@modules/class/classroom");
const { logger } = require("@modules/logger");
const NotFoundError = require("@errors/not-found-error");
const ForbiddenError = require("@errors/forbidden-error");

module.exports = (router) => {
    // Gets the polls of a class
    router.get("/class/:id/polls", (req, res) => {
        // Get the class key from the request parameters
        let classId = req.params.id;

        // Log the request details
        logger.log("info", `[get api/class/${classId}/polls] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

        // If the class does not exist, return an error
        if (!classInformation.classrooms[classId]) {
            logger.log("verbose", `[get api/class/${classId}/polls] class not started`);
            throw new NotFoundError("Class not started");
        }

        // Get the user from the session
        let user = req.session.user;

        // If the user is not in the class, return an error
        if (!classInformation.classrooms[classId].students[user.email]) {
            logger.log("verbose", `[get api/class/${classId}/polls] user is not logged in`);
            throw new ForbiddenError("User is not logged into the selected class");
        }

        // Get a clone of the class data and the poll responses in the class
        let classData = structuredClone(classInformation.classrooms[classId]);

        // If the class does not exist, return an error
        if (!classData) {
            logger.log("verbose", `[get api/class/${classId}/polls] class not started`);
            throw new NotFoundError("Class not started");
        }

        // Update the class data with the poll status, the total number of students, and the poll data
        classData.poll = {
            status: classData.status,
            totalStudents: Object.keys(classData.students).length,
            ...classData.poll,
        };

        // Log the poll data
        logger.log("verbose", `[get api/class/${classId}/polls] response=(${JSON.stringify(classData.poll)})`);

        // Send the poll data as a JSON response
        res.status(200).json(classData.poll);
    });
};
