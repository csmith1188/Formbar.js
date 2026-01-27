const { classInformation, getClassUsers } = require("@modules/class/classroom");
const { TEACHER_PERMISSIONS } = require("@modules/permissions");
const { logger } = require("@modules/logger");
const NotFoundError = require("@errors/not-found-error");
const ForbiddenError = require("@errors/forbidden-error");

module.exports = (router) => {
    // Gets a class by id
    router.get("/class/:id", async (req, res) => {
        let classId = req.params.id;

        // Log the request details
        logger.log("info", `[get api/class/${classId}] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

        // Get a clone of the class data
        // If the class does not exist, return an error
        const classData = structuredClone(classInformation.classrooms[classId]);
        if (!classData) {
            throw new NotFoundError("Class not started");
        }

        // Get the user from the session, and if the user is not in the class, return an error
        const user = req.session.user;
        if (!classData.students[user.email]) {
            logger.log("verbose", `[get api/class/${classId}] user is not logged in`);
            throw new ForbiddenError("User is not logged into the selected class");
        }

        // Get the users in the class
        const classUsers = await getClassUsers(user, classData.key);

        // If an error occurs, log the error and return the error
        if (classUsers.error) {
            logger.log("info", `[get api/class/${classId}] ${classUsers}`);
            throw new NotFoundError(classUsers);
        }

        // If the user is not a teacher or manager, remove the sensitive data from the class data
        if (user.classPermissions < TEACHER_PERMISSIONS) {
            delete classData.pollHistory;
            delete classData.key;
            delete classData.sharedPolls;

            classData.students = { [req.session.email]: classUsers[req.session.email] };
        } else {
            classData.students = classUsers;
        }

        // Log the class data and send the response
        logger.log("verbose", `[get api/class/${classId}] response=(${JSON.stringify(classData)})`);
        res.status(200).json(classData);
    });
};
