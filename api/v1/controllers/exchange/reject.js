const { isAuthenticated, isVerified } = require("@middleware/authentication");
const { requireParam, requireBodyParam } = require("@modules/error-wrapper");
const { rejectExchange } = require("@services/exchange-service");
const ValidationError = require("@errors/validation-error");

/**
 * Register exchanges reject controller routes.
 * @param {import("express").Router} router
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/exchanges/{id}/reject:
     *   post:
     *     summary: Reject a exchange (recipient only)
     *     description: >
     *       Rejects a pending exchange as the recipient. The requester receives a
     *       `exchange_rejected` notification.
     *     tags: [Exchanges]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - pin
     *             properties:
     *               pin:
     *                 type: string
     *                 description: 4-6 numeric user or pool pin
     *                 example: "1234"
     *     responses:
     *       200:
     *         description: exchange rejected successfully
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
     *         description: Exchange not found
     */
    router.post("/exchanges/:id/reject", isAuthenticated, isVerified, async (req, res) => {
        requireParam(req.params.id, "id");
        requireBodyParam(req.body.pin, "pin");

        const { pin } = req.body;
        const exchangeId = Number(req.params.id);
        if (!Number.isInteger(exchangeId) || exchangeId <= 0) {
            throw new ValidationError("exchange ID must be a positive integer.", { reason: "invalid_exchange_id" });
        }

        req.infoEvent("exchanges.reject", "Rejecting exchange", { exchangeId, userId: req.user.id });

        await rejectExchange(exchangeId, pin);
        res.status(200).json({ success: true, data: {} });
    });
};
