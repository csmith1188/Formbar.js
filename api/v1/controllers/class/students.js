const { logger } = require("@modules/logger");
const { hasClassPermission } = require("@modules/middleware/permissionCheck");
const { classInformation } = require("@modules/class/classroom");
const { CLASS_PERMISSIONS, GUEST_PERMISSIONS } = require("@modules/permissions");
const { dbGetAll } = require("@modules/database");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    // Gets the students of a class
    router.get("/class/:id/students", hasClassPermission(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
        // Get the class key from the request parameters and log the request details
        const classId = req.params.id;

        // Get the students of the class
        // If an error occurs, log the error and return the error
        const classUsers = await dbGetAll(
            "SELECT users.id, users.displayName, users.digipogs, classUsers.permissions AS classPermissions FROM users INNER JOIN classUsers ON users.id = classUsers.studentId WHERE classUsers.classId = ?",
            [classId]
        );
        if (classUsers.error) {
            throw new NotFoundError(classUsers);
        }

        // Guest users cannot be found in the database, so if the classroom exists, then add them to the list
        const classroom = classInformation.classrooms[classId];
        if (classroom) {
            for (const [studentId, studentInfo] of Object.entries(classroom.students)) {
                if (studentInfo.permissions === GUEST_PERMISSIONS && !classUsers.find((user) => user.id === studentId)) {
                    classUsers.push({
                        id: studentId,
                        displayName: studentInfo.displayName || "Guest",
                        classPermissions: 0,
                    });
                }
            }
        }

        // Send the students of the class as a JSON response
        res.status(200).json(classUsers);
    });
};
