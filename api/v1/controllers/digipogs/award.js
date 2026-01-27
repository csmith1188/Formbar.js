const { hasClassPermission } = require("@modules/middleware/permission-check");
const { CLASS_PERMISSIONS } = require("@modules/permissions");
const { awardDigipogs } = require("@modules/digipogs");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/digipogs/award:
     *   post:
     *     summary: Award digipogs to a user
     *     tags:
     *       - Digipogs
     *     description: |
     *       Awards digipogs to a user.
     *
     *       **Required Permission:** Class-specific `MANAGE_CLASS` permission (typically Teacher or Manager) OR global permission level >= 4 (Teacher or above)
     *
     *       **Permission Levels (global):**
     *       - 1: Guest
     *       - 2: Student
     *       - 3: Moderator
     *       - 4: Teacher
     *       - 5: Manager
     *     security:
     *       - bearerAuth: []
     *       - sessionAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               userId:
     *                 type: string
     *                 example: "user123"
     *               amount:
     *                 type: integer
     *                 example: 10
     *     responses:
     *       200:
     *         description: Digipogs awarded successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
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
     *         description: Award failed
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.post("/digipogs/award", hasClassPermission(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
        const result = await awardDigipogs(req.body, req.session);
        if (!result.success) {
            throw new AppError(result);
        }
        res.status(200).json(result);
    });
};
