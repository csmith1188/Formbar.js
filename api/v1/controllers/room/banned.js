const { dbGetAll } = require("@modules/database");
const { logger } = require("@modules/logger");
const { hasClassPermission } = require("../middleware/permission-check");
const { classInformation } = require("@modules/class/classroom");
const { TEACHER_PERMISSIONS } = require("@modules/permissions");

module.exports = (router) => {
    try {
        /**
         * @swagger
         * /api/v1/class/{id}/banned:
         *   get:
         *     summary: Get banned users in a class
         *     tags:
         *       - Class
         *     description: Returns a list of users who are banned from a specific class. Requires teacher permissions.
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
         *         description: Banned users retrieved successfully
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         *                 properties:
         *                   id:
         *                     type: string
         *                   email:
         *                     type: string
         *                   displayName:
         *                     type: string
         *       404:
         *         description: Class not started
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
        // Get banned users for a class
        router.get("/class/:id/banned", hasClassPermission(TEACHER_PERMISSIONS), async (req, res) => {
            try {
                const classId = req.params.id;
                logger.log("info", `[get api/class/${classId}/banned] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

                // Ensure class exists
                if (!classInformation.classrooms[classId]) {
                    return res.status(404).json({ error: "Class not started" });
                }

                const rows = await dbGetAll(
                    "SELECT users.id, users.email, users.displayName FROM classusers JOIN users ON users.id = classusers.studentId WHERE classusers.classId=? AND classusers.permissions=0",
                    [classId]
                );
                res.status(200).json(rows || []);
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: "There was a server error try again." });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
