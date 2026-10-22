const { isAuthenticated } = require("@middleware/authentication");
const { requireParam, requireBodyParam } = require("@modules/error-wrapper");
const { acceptExchange } = require("@services/exchange-service");
const ValidationError = require("@errors/validation-error");

/**
 * Register trades accept controller routes.
 * @param {import("express").Router} router
 */
module.exports = (router) => {
        /**
    * @swagger
    * /api/v1/exchanges/{id}/accept:
    *   post:
    *     summary: Accept an exchange
    *     description: Accepts an exchange between two parties
    *     tags:
    *       - Exchanges
    *     security:
    *       - bearerAuth: []
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
    *         description: Exchange accepted successfully
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
    *                       nullable: true
    *       400:
    *         description: Request is badly formed or is missing PIN.
    *       401:
    *         description: Invalid PIN
    *       403:
    *         description: Insufficient resources
    *       404:
    *         description: Invalid IDs
    *       500:
    *         description: Failed transfer
    */
    router.post("/exchanges/:id/accept", isAuthenticated, async (req, res) => {
        const { pin } = req.body;

        requireParam(req.params.id, "id");
        requireBodyParam(pin, "pin");

        const exchangeId = Number(req.params.id);
        if (!Number.isInteger(exchangeId) || exchangeId <= 0) {
            throw new ValidationError("Exchange ID must be a positive integer.", { reason: "exchange_id" });
        }

        req.infoEvent("exchanges.accept", "Accepting exchange", { exchangeId, userId: req.user.id });

        const { success, reason } = await acceptExchange(exchangeId, pin);
        res.status(200).json({ success: true, data: { accepted: success, reason: reason || null } });
    });
};
