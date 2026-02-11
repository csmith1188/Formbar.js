const { TEACHER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("@middleware/permission-check");
const { isAuthenticated } = require("@middleware/authentication");
const classService = require("@services/class-service");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/create:
     *   post:
     *     summary: Create a new class
     *     tags:
     *       - Class
     *     description: |
     *       Creates a new class.
     *
     *       **Required Permission:** Global Teacher permission (level 4)
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
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - name
     *             properties:
     *               name:
     *                 type: string
     *                 example: "Math 101"
     *     responses:
     *       200:
     *         description: Class created successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                   example: "Class created successfully"
     *                 classId:
     *                   type: string
     *                   example: "abc123"
     *       400:
     *         description: Invalid class name or missing name
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
     *         description: Insufficient permissions
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
    router.post("/class/create", isAuthenticated, hasPermission(TEACHER_PERMISSIONS), async (req, res) => {
        const { name } = req.body;
        if (!name) {
            throw new ValidationError("Class name is required", { event: "class.create.failed", reason: "missing_name" });
        }

        const { valid, error } = classService.validateClassroomName(name);
        if (!valid) {
            throw new ValidationError(error, { event: "class.create.failed", reason: "invalid_name" });
        }

        const { userId, email: userEmail } = req.user;
        req.infoEvent("class.create.attempt", "Attempting to create class", { className: name, userId });

        const result = await classService.createClass(name, userId, userEmail);
        
        req.infoEvent("class.create.success", "Class created successfully", { classId: result.classId, className: name, userId });

        return res.status(200).json({
            success: true,
            data: {
                message: "Class created successfully",
                ...result,
            },
        });
    });
};
