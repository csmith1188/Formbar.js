const { logger } = require("@modules/logger");
const { TEACHER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("@modules/middleware/permission-check");
const classService = require("@services/class-service");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/create:
     *   post:
     *     summary: Create a new class
     *     tags:
     *       - Class
     *     description: Creates a new class (requires teacher permissions)
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
    router.post("/class/create", hasPermission(TEACHER_PERMISSIONS), async (req, res) => {
        try {
            const { name } = req.body;
            if (!name) {
                return res.status(400).json({ error: "Class name is required" });
            }

            const { valid, error } = classService.validateClassroomName(name);
            if (!valid) {
                return res.status(400).json({ error });
            }

            const { userId, email: userEmail } = req.session;
            logger.log("info", `[post /class/create] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
            logger.log("verbose", `[post /class/create] className=(${name})`);

            const result = await classService.createClass(name, userId, userEmail);
            req.session.classId = result.classId;

            return res.status(200).json({
                message: "Class created successfully",
                ...result,
            });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "There was a server error. Please try again." });
        }
    });
};
