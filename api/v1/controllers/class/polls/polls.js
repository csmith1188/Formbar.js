const { classInformation } = require("@modules/class/classroom");
const NotFoundError = require("@errors/not-found-error");
const ForbiddenError = require("@errors/forbidden-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/polls:
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
    router.get("/class/:id/polls", (req, res) => {
        // Get the class key from the request parameters
        let classId = req.params.id;

        // Log the request details
        req.infoEvent("class.polls.view", "Viewing class polls", { classId });

        // If the class does not exist, return an error
        if (!classInformation.classrooms[classId]) {
            throw new NotFoundError("Class not started", { event: "class.polls.not_started", reason: "class_not_loaded" });
        }

        // Get the user from the session
        let user = req.user;

        // If the user is not in the class, return an error
        if (!classInformation.classrooms[classId].students[user.email]) {
            throw new ForbiddenError("User is not logged into the selected class", {
                event: "class.polls.not_in_class",
                reason: "user_not_in_class",
            });
        }

        // Get a clone of the class data and the poll responses in the class
        let classData = structuredClone(classInformation.classrooms[classId]);

        // If the class does not exist, return an error
        if (!classData) {
            throw new NotFoundError("Class not started", { event: "class.polls.not_started", reason: "class_not_loaded" });
        }

        // Update the class data with the poll status, the total number of students, and the poll data
        classData.poll = {
            status: classData.status,
            totalStudents: Object.keys(classData.students).length,
            ...classData.poll,
        };

        // Log the poll data
        req.infoEvent("class.polls.data_sent", "Poll data sent to client", { classId, pollStatus: classData.poll.status });

        // Send the poll data as a JSON response
        res.status(200).json({
            success: true,
            data: classData.poll,
        });
    });
};
