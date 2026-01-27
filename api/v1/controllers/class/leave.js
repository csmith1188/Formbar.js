const { httpPermCheck } = require("@modules/middleware/permission-check");
const { leaveClass } = require("@modules/class/class");
const ForbiddenError = require("@errors/forbidden-error");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/leave:
     *   post:
     *     summary: Leave a class session
     *     tags:
     *       - Class
     *     description: Leaves the current class session. The user is still attached to the classroom.
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
     *     responses:
     *       200:
     *         description: Successfully left the class session
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       400:
     *         description: Class ID is required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       403:
     *         description: Unauthorized
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post("/class/:id/leave", httpPermCheck("leaveClass"), async (req, res) => {
        const classId = req.params.id;

        // Validate that classId is provided
        if (!classId) {
            throw new ValidationError("Class ID is required.");
        }

        const result = leaveClass(req.session, req.params.id);
        if (!result) {
            throw new ForbiddenError("Unauthorized");
        }

        res.status(200).json({ success: true });
    });
};
