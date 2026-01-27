const { dbGetAll } = require("@modules/database");
const { logger } = require("@modules/logger");
const { hasClassPermission } = require("@modules/middleware/permission-check");
const { classInformation } = require("@modules/class/classroom");
const { TEACHER_PERMISSIONS } = require("@modules/permissions");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/banned:
     *   get:
     *     summary: Get banned users in a class
     *     tags:
     *       - Class
     *     description: Returns a list of users banned from a classroom (requires teacher permissions)
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
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
     *       403:
     *         description: Insufficient permissions
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
    router.get("/class/:id/banned", hasClassPermission(TEACHER_PERMISSIONS), async (req, res) => {
        const classId = req.params.id;
        logger.log("info", `[get api/class/${classId}/banned] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

        // Ensure class exists
        if (!classInformation.classrooms[classId]) {
            throw new NotFoundError("Class not started");
        }

        const rows = await dbGetAll(
            "SELECT users.id, users.email, users.displayName FROM classusers JOIN users ON users.id = classusers.studentId WHERE classusers.classId=? AND classusers.permissions=0",
            [classId]
        );
        res.status(200).json(rows || []);
    });
};
