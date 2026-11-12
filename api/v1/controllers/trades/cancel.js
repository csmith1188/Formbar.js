const { isAuthenticated, isVerified } = require("@middleware/authentication");
const { requireParam } = require("@modules/error-wrapper");
const { cancelTrade } = require("@services/trade-service");
const ValidationError = require("@errors/validation-error");

/**
 * Register trades cancel controller routes.
 * @param {import("express").Router} router
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/trades/{id}/cancel:
     *   post:
     *     summary: Cancel a trade (requester only). This endpoint is deprecated. Use the endpoints under the Exchanges tag.
     *     deprecated: true
     *     description: >
     *       Cancels a pending trade as the requester. The recipient receives a
     *       `trade_canceled` notification.
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
     *         description: Trade canceled successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: object
     *       401:
     *         description: Not authenticated
     *       403:
     *         description: User is not the requester
     *       404:
     *         description: Trade not found
     */
    router.post("/trades/:id/cancel", isAuthenticated, isVerified, async (req, res) => {
        requireParam(req.params.id, "id");

        const tradeId = Number(req.params.id);
        if (!Number.isInteger(tradeId) || tradeId <= 0) {
            throw new ValidationError("Trade ID must be a positive integer.", { reason: "invalid_trade_id" });
        }

        req.infoEvent("trades.cancel", "Canceling trade", { tradeId, userId: req.user.id });

        await cancelTrade(tradeId, req.user.id);
        res.status(200).json({ success: true, data: {} });
    });
};
