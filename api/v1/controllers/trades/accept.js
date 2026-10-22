const { isAuthenticated, isVerified } = require("@middleware/authentication");
const { requireParam } = require("@modules/error-wrapper");
const { acceptTrade } = require("@services/trade-service");
const ValidationError = require("@errors/validation-error");

/**
 * Register trades accept controller routes.
 * @param {import("express").Router} router
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/trades/{id}/accept:
     *   post:
     *     summary: Accept a trade (recipient only). This endpoint is deprecated. Use the endpoints under the Exchanges tag.
     *     deprecated: true
     *     description: >
     *       Accepts a pending trade as the recipient. Atomically re-checks both
     *       sides for available assets and performs the full exchange in a single
     *       SQLite transaction. If any asset is no longer available the trade is
     *       marked `failed` with no partial movement and both participants are
     *       notified. On success both participants receive a `trade_completed`
     *       notification.
     *     tags: [Trades]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       200:
     *         description: Trade accepted or failed atomically
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: object
     *                   properties:
     *                     accepted:
     *                       type: boolean
     *                     reason:
     *                       type: string
     *                       description: Failure reason when accepted is false
     *       401:
     *         description: Not authenticated
     *       400:
     *         description: Invalid trade ID or trade is no longer pending
     *       403:
     *         description: User is not the recipient
     *       404:
     *         description: Trade not found
     */
    router.post("/trades/:id/accept", isAuthenticated, isVerified, async (req, res) => {
        requireParam(req.params.id, "id");

        const tradeId = Number(req.params.id);
        if (!Number.isInteger(tradeId) || tradeId <= 0) {
            throw new ValidationError("Trade ID must be a positive integer.", { reason: "invalid_trade_id" });
        }

        req.infoEvent("trades.accept", "Accepting trade", { tradeId, userId: req.user.id });

        const result = await acceptTrade(tradeId, req.user.id);
        res.status(200).json({ success: true, data: { accepted: result.success, reason: result.reason || null } });
    });
};
