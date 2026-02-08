const { httpPermCheck } = require("@modules/middleware/permission-check");
const { classInformation } = require("@modules/class/classroom");
const { requestBreak } = require("@modules/class/break");
const { isAuthenticated } = require("@modules/middleware/authentication");
const ForbiddenError = require("@errors/forbidden-error");
const ValidationError = require("@errors/validation-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/break/request:
     *   post:
     *     summary: Request a break
     *     tags:
     *       - Class - Breaks
     *     description: |
     *       Submits a break request for a class.
     *
     *       **Required Permission:** Class-specific Student permission (level 2)
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
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - reason
     *             properties:
     *               reason:
     *                 type: string
     *                 example: "Need to use the restroom"
     *     responses:
     *       200:
     *         description: Break request submitted successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       400:
     *         description: Reason is required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: Not authorized to request a break in this class
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
    router.post("/class/:id/break/request", isAuthenticated, httpPermCheck("requestBreak"), async (req, res) => {
        const classId = req.params.id;
        const classroom = classInformation.classrooms[classId];
        if (classroom && !classroom.students[req.user.email]) {
            throw new ForbiddenError("You do not have permission to request a break.");
        }

        if (!req.body.reason) {
            throw new ValidationError("A reason for the break must be provided.");
        }

        const result = requestBreak(req.body.reason, { ...req.user, classId });
        if (result === true) {
            res.status(200).json({
                success: true,
                data: {},
            });
        } else {
            throw new AppError(result, 500);
        }
    });
};
