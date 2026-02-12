const { httpPermCheck } = require("@middleware/permission-check");
const { transferDigipogs } = require("@modules/digipogs");
const { isAuthenticated } = require("@middleware/authentication");
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
     *       - apiKeyAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - to
     *               - amount
     *               - pin
     *             properties:
     *               to:
     *                 type: string
     *                 example: "user123"
     *                 description: ID of the recipient user
     *               amount:
     *                 type: integer
     *                 example: 5
     *                 description: Number of digipogs to transfer
     *               pin:
     *                 type: string
     *                 example: "1234"
     *                 description: User's PIN for authentication
     *               reason:
     *                 type: string
     *                 example: "Payment for services"
     *                 description: Optional reason for the transfer
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
    router.post("/digipogs/transfer", isAuthenticated, httpPermCheck("transferDigipogs"), async (req, res) => {
        const { to, amount, pin, reason } = req.body || {};

        // Derive the authenticated user ID from the server-side context, not from client input
        const from = req.user?.id || req.user?.userId;

        if (!from) {
            throw new AppError({
                statusCode: 401,
                message: "Unable to determine authenticated user for digipogs transfer.",
                event: "digipogs.transfer.failed",
                reason: "user_not_found"
            });
        }

        req.infoEvent("digipogs.transfer.attempt", "Attempting to transfer digipogs", { from, to, amount });

        const transferPayload = {
            from,
            to,
            amount,
            pin,
            ...(reason !== undefined && { reason }),
        };

        const result = await transferDigipogs(transferPayload);
        if (!result.success) {
            throw new AppError(result, { event: "digipogs.transfer.failed", reason: "transfer_error" });
        }
        
        req.infoEvent("digipogs.transfer.success", "Digipogs transferred successfully", { from, to, amount });
        res.status(200).json({
            success: true,
            data: result,
        });
    });
};
