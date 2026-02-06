const { logger } = require("@modules/logger");
const { hasClassPermission } = require("@modules/middleware/permission-check");
const { isAuthenticated } = require("@modules/middleware/authentication");
const { classInformation } = require("@modules/class/classroom");
const { CLASS_PERMISSIONS, GUEST_PERMISSIONS } = require("@modules/permissions");
const { dbGetAll } = require("@modules/database");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/students:
     *   get:
     *     summary: Get students in a class
     *     tags:
     *       - Class
     *     description: |
     *       Returns a list of students enrolled in a class.
     *
     *       **Required Permission:** Class-specific `manageClass` permission (default: Teacher)
     *
     *       **Permission Levels:**
     *       - 1: Guest
     *       - 2: Student
     *       - 3: Moderator
     *       - 4: Teacher
     *       - 5: Manager
     *     security:
     *       - bearerAuth: []
     *       - sessionAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
     *     responses:
     *       200:
     *         description: Students retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/Student'
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: Insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       404:
     *         description: Class not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     */
    router.get("/class/:id/students", isAuthenticated, hasClassPermission(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
        // Get the class key from the request parameters and log the request details
        const classId = req.params.id;
        logger.log("info", `get api/class/${classId}/students ip=(${req.ip}) user=(${req.user?.email})`);

        // Get the students of the class
        // If an error occurs, log the error and return the error
        const classUsers = await dbGetAll(
            "SELECT users.id, users.displayName, users.digipogs, classUsers.permissions AS classPermissions FROM users INNER JOIN classUsers ON users.id = classUsers.studentId WHERE classUsers.classId = ?",
            [classId]
        );
        if (classUsers.error) {
            logger.log("info", `[get api/class/${classId}] ${classUsers}`);
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
        res.status(200).json({
            success: true,
            data: classUsers,
        });
    });
};
