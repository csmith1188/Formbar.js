const { logger } = require("@modules/logger");
const { TEACHER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("@middleware/permission-check");
const { isAuthenticated } = require("@middleware/authentication");
const classService = require("@services/class-service");

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
        try {
            const { name } = req.body;
            if (!name) {
                return res.status(400).json({ error: "Class name is required" });
            }

            const { valid, error } = classService.validateClassroomName(name);
            if (!valid) {
                return res.status(400).json({ error });
            }

            const { userId, email: userEmail } = req.user;
            req.infoEvent("class.create.attempt", `Attempting to create class`, { user: req.user?.email, ip: req.ip, className: name });
            req.infoEvent("class.create.details", `Class creation details`, { className: name, userId });

            const result = await classService.createClass(name, userId, userEmail);

            return res.status(200).json({
                success: true,
                data: {
                    message: "Class created successfully",
                    ...result,
                },
            });
        } catch (err) {
            req.warnEvent("class.create.error", `Error creating class`, { error: err.message, stack: err.stack });
            res.status(500).json({ error: "There was a server error. Please try again." });
        }
    });
};
