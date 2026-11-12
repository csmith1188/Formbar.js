const { isAuthenticated, isVerified } = require("@middleware/authentication");
const { requireParam } = require("@modules/error-wrapper");
const { rejectTrade } = require("@services/trade-service");
const ValidationError = require("@errors/validation-error");

/**
 * Register trades reject controller routes.
 * @param {import("express").Router} router
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/trades/{id}/reject:
     *   post:
     *     summary: Reject a trade (recipient only). This endpoint is deprecated. Use the endpoints under the Exchanges tag.
     *     deprecated: true
     *     description: >
     *       Rejects a pending trade as the recipient. The requester receives a
     *       `trade_rejected` notification.
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
     *         description: Trade rejected successfully
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
     *         description: User is not the recipient
     *       404:
     *         description: Trade not found
     */
    router.post("/trades/:id/reject", isAuthenticated, isVerified, async (req, res) => {
        requireParam(req.params.id, "id");

        const tradeId = Number(req.params.id);
        if (!Number.isInteger(tradeId) || tradeId <= 0) {
            throw new ValidationError("Trade ID must be a positive integer.", { reason: "invalid_trade_id" });
        }

        req.infoEvent("trades.reject", "Rejecting trade", { tradeId, userId: req.user.id });

        await rejectTrade(tradeId, req.user.id);
        res.status(200).json({ success: true, data: {} });
    });
};
