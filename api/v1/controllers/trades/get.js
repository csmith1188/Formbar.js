const { isAuthenticated, isVerified } = require("@middleware/authentication");
const { requireParam } = require("@modules/error-wrapper");
const { getTradeById } = require("@services/trade-service");
const NotFoundError = require("@errors/not-found-error");
const ValidationError = require("@errors/validation-error");

/**
 * Register trades get controller routes.
 * @param {import("express").Router} router
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/trades/{id}:
     *   get:
     *     summary: Get a trade by ID. This endpoint is deprecated. Use the endpoints under the Exchanges tag.
     *     deprecated: true
     *     description: >
     *       Returns a single trade. Returns 404 if the trade does not exist or if
     *       the requesting user is not a participant, so that the existence of
     *       trades is not revealed to non-participants.
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
     *         description: Trade returned successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   $ref: '#/components/schemas/Trade'
     *       401:
     *         description: Not authenticated
     *       404:
     *         description: Trade not found or user is not a participant
     */
    router.get("/trades/:id", isAuthenticated, isVerified, async (req, res) => {
        requireParam(req.params.id, "id");

        const tradeId = Number(req.params.id);
        if (!Number.isInteger(tradeId) || tradeId <= 0) {
            throw new ValidationError("Trade ID must be a positive integer.", { reason: "invalid_trade_id" });
        }

        req.infoEvent("trades.get", "Fetching trade", { tradeId, userId: req.user.id });

        const trade = await getTradeById(tradeId, req.user.id);
        if (!trade) {
            throw new NotFoundError("Trade not found.");
        }

        res.status(200).json({ success: true, data: trade });
    });
};
