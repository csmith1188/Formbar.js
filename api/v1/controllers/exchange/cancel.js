const { isAuthenticated, isVerified } = require("@middleware/authentication");
const { requireParam, requireBodyParam } = require("@modules/error-wrapper");
const { cancelExchange } = require("@services/exchange-service");
const ValidationError = require("@errors/validation-error");

/**
 * Register trades cancel controller routes.
 * @param {import("express").Router} router
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/exchanges/{id}/cancel:
     *   post:
     *     summary: Cancel an exchange (requester only)
     *     description: >
     *       Cancels a pending exchanges as the requester. The recipient receives a
     *       `exchanges_canceled` notification.
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
     *         description: Exchange canceled successfully
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
     *         description: Exchange not found
     */
    router.post("/exchanges/:id/cancel", isAuthenticated, async (req, res) => {
        requireParam(req.params.id, "id");
        requireBodyParam(req.body.pin, "pin");

        const exchangeId = Number(req.params.id);
        const { pin } = req.body;
        if (!Number.isInteger(exchangeId) || exchangeId <= 0) {
            throw new ValidationError("Exchange ID must be a positive integer.", { reason: "invalid_exchange_id" });
        }

        req.infoEvent("exchanges.cancel", "Canceling exchange", { exchangeId, userId: req.user.id });

        await cancelExchange(exchangeId, pin);
        res.status(200).json({ success: true, data: {} });
    });
};
