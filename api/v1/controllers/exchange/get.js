const { isAuthenticated, isVerified } = require("@middleware/authentication");
const { requireParam } = require("@modules/error-wrapper");
const { getExchangeById } = require("@services/exchange-service");
const NotFoundError = require("@errors/not-found-error");
const ValidationError = require("@errors/validation-error");

/**
 * Register trades get controller routes.
 * @param {import("express").Router} router
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/exchanges/{id}:
     *   get:
     *     summary: Get an exchange by ID
     *     description: >
     *       Returns a single exchange. Returns 404 if the exchange does not exist or if
     *       the requesting user is not a participant, so that the existence of
     *       exchanges is not revealed to non-participants.
     *     tags: [Exchanges]
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
     *         description: exchange returned successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   $ref: '#/components/schemas/Exchange'
     *       401:
     *         description: Not authenticated
     *       404:
     *         description: exchange not found or user is not a participant
     */
    router.get("/exchanges/:id", isAuthenticated, isVerified, async (req, res) => {
        requireParam(req.params.id, "id");

        const exchangeId = Number(req.params.id);
        if (!Number.isInteger(exchangeId) || exchangeId <= 0) {
            throw new ValidationError("Exchange ID must be a positive integer.", { reason: "invalid_exchange_id" });
        }

        req.infoEvent("exchanges.get", "Fetching exchange", { exchangeId, userId: req.user.id });

        const exchange = await getExchangeById(exchangeId, req.user.id);
        if (!exchange) {
            throw new NotFoundError("Exchange not found.");
        }

        res.status(200).json({ success: true, data: exchange });
    });
};
