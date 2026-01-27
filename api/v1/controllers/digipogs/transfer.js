const { httpPermCheck } = require("@modules/middleware/permission-check");
const { transferDigipogs } = require("@modules/digipogs");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/digipogs/transfer:
     *   post:
     *     summary: Transfer digipogs to another user
     *     tags:
     *       - Digipogs
     *     description: |
     *       Transfers digipogs from your account to another user.
     *
     *       **Required Permission:** Global Student permission (level 2)
     *
     *       **Permission Levels:**
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
     *             required:
     *               - to
     *               - amount
     *             properties:
     *               to:
     *                 type: string
     *                 example: "user123"
     *                 description: ID of the recipient user
     *               amount:
     *                 type: integer
     *                 example: 5
     *                 description: Number of digipogs to transfer
     *     responses:
     *       200:
     *         description: Digipogs transferred successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *       400:
     *         description: Missing required fields or invalid amount
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
     *       500:
     *         description: Transfer failed
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.post("/digipogs/transfer", httpPermCheck("transfer"), async (req, res) => {
        const result = await transferDigipogs(req.body);
        if (!result.success) {
            throw new AppError(result);
        }
        res.status(200).json(result);
    });
};
