const { logger } = require("@modules/logger");
const { hasClassPermission } = require("../middleware/permission-check");
const { classInformation } = require("@modules/class/classroom");
const { CLASS_PERMISSIONS, GUEST_PERMISSIONS } = require("@modules/permissions");
const { dbGetAll } = require("@modules/database");

module.exports = (router) => {
    try {
        /**
         * @swagger
         * /api/v1/class/{id}/students:
         *   get:
         *     summary: Get students in a class
         *     tags:
         *       - Class
         *     description: Returns a list of all students in a class, including guest users. Requires class management permissions.
         *     parameters:
         *       - in: path
         *         name: id
         *         required: true
         *         description: The ID of the class
         *         schema:
         *           type: string
         *           example: "1"
         *     responses:
         *       200:
         *         description: Students retrieved successfully
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         *                 properties:
         *                   id:
         *                     type: string
         *                   displayName:
         *                     type: string
         *                   digipogs:
         *                     type: integer
         *                   classPermissions:
         *                     type: integer
         *       404:
         *         description: Class not found or error retrieving students
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/NotFoundError'
         *       500:
         *         description: Server error
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ServerError'
         */
        // Gets the students of a class
        router.get("/class/:id/students", hasClassPermission(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
            try {
                // Get the class key from the request parameters and log the request details
                const classId = req.params.id;
                logger.log("info", `get api/class/${classId}/students ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

                // Get the students of the class
                // If an error occurs, log the error and return the error
                const classUsers = await dbGetAll(
                    "SELECT users.id, users.displayName, users.digipogs, classUsers.permissions AS classPermissions FROM users INNER JOIN classUsers ON users.id = classUsers.studentId WHERE classUsers.classId = ?",
                    [classId]
                );
                if (classUsers.error) {
                    logger.log("info", `[get api/class/${classId}] ${classUsers}`);
                    res.status(404).json(classUsers);
                    return;
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
            } catch (err) {
                // If an error occurs, log the error and send an error message as a JSON response
                logger.log("error", err.stack);
                res.status(500).json({ error: "There was a server error try again." });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
