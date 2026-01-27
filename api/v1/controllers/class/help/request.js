const { httpPermCheck } = require("@modules/middleware/permission-check");
const { classInformation } = require("@modules/class/classroom");
const { sendHelpTicket } = require("@modules/class/help");
const ForbiddenError = require("@errors/forbidden-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/help/request:
     *   get:
     *     summary: Request help in a class
     *     tags:
     *       - Class - Help
     *     description: Submits a help request in a class session
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
     *     responses:
     *       200:
     *         description: Help request submitted successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       403:
     *         description: Not authorized to request help in this class
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.get("/class/:id/help/request", httpPermCheck("help"), async (req, res) => {
        const classId = req.params.id;
        const classroom = classInformation.classrooms[classId];
        if (classroom && !classroom.students[req.session.email]) {
            throw new ForbiddenError("You do not have permission to request help in this class.");
        }

        const result = await sendHelpTicket(true, req.params.userId, req.session.user);
        if (result === true) {
            res.status(200).json({ success: true });
        } else {
            throw new AppError(result, 500);
        }
    });
};
