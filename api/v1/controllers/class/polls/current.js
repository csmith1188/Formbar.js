const { classInformation } = require("@modules/class/classroom");
const { logger } = require("@modules/logger");
const { dbGet } = require("@modules/database");
const { requireQueryParam } = require("@modules/error-wrapper");
const { isAuthenticated } = require("@modules/middleware/authentication");
const NotFoundError = require("@errors/not-found-error");
const ForbiddenError = require("@errors/forbidden-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/polls/current:
     *   get:
     *     summary: Get current poll in a class
     *     tags:
     *       - Class - Polls
     *     description: |
     *       Returns the current poll data for a class, including status and responses.
     *
     *       **Required Permission:** Must be a member of the class (Class-specific `seePoll` permission, default: Guest)
     *
     *       **Permission Levels:**
     *       - 1: Guest
     *       - 2: Student
     *       - 3: Moderator
     *       - 4: Teacher
     *       - 5: Manager
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
     *     responses:
     *       200:
     *         description: Poll data retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Poll'
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: User is not logged into the selected class
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       404:
     *         description: Class not started
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     */
    router.get("/class/:id/polls/current", isAuthenticated, async (req, res) => {
        const classId = req.params.id;
        requireQueryParam(classId, "classId");

        logger.log("info", `[get api/class/${classId}/polls] ip=(${req.ip}) user=(${req.user?.email})`);

        // Check if class exists
        const classroomExists = Boolean(classInformation.classrooms[classId]);
        if (!classroomExists) {
            const classId = await dbGet("SELECT id FROM classroom WHERE id = ?", [classId]);
            if (classId) {
                // The classroom exists in the database, but it's not currently active
                logger.log("verbose", `[get api/class/${classId}/polls] class not started`);
                throw new NotFoundError("This class is not currently active");
            } else {
                // The classroom does not exist
                logger.log("verbose", `[get api/class/${classId}/polls] class does not exist`);
                throw new NotFoundError("This class does not exist");
            }
        }

        const user = req.user;

        // If the user is not in the class, return an error
        console.log(classInformation.classrooms[classId].students);
        if (!classInformation.classrooms[classId].students[user.email]) {
            logger.log("verbose", `[get api/class/${classId}/polls] user does not have permission to view polls in this class`);
            throw new ForbiddenError("You do not have permission to view polls in this class");
        }

        // Create a clone of the class data and add poll information to it
        const classData = structuredClone(classInformation.classrooms[classId]);
        classData.poll = {
            status: classData.status,
            totalStudents: Object.keys(classData.students).length,
            ...classData.poll,
        };

        logger.log("verbose", `[get api/class/${classId}/polls] response=(${JSON.stringify(classData.poll)})`);

        res.status(200).json({
            success: true,
            data: classData.poll,
        });
    });
};
