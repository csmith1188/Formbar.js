const { createExchange } = require("@services/exchange-service");
const { isAuthenticated } = require("@middleware/authentication");
const { requireBodyParam } = require("@modules/error-wrapper");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    /**
    * @swagger
    * /api/v1/exchanges:
    *   post:
    *     summary: Create a new exchange
    *     description: Creates a new exchange transaction between two parties
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
    *               - to
    *               - from
    *             properties:
    *               to:
    *                 type: object
    *                 required:
    *                   - id
    *                   - type
    *                   - request
    *                 properties:
    *                   id:
    *                     type: integer
    *                     example: 2
    *                   type:
    *                     type: string
    *                     enum:
    *                       - user
    *                       - pool
    *                   request:
    *                     type: object
    *                     description: Item quantities keyed by item ID (0 for digipogs).
    *                     additionalProperties:
    *                       type: integer
    *                       description: Quantity of the item.
    *                     example:
    *                       "1": 67
    *                       "27": 20
    *               from:
    *                 type: object
    *                 required:
    *                   - id
    *                   - type
    *                   - offer
    *                   - pin
    *                 properties:
    *                   id:
    *                     type: integer
    *                     example: 1
    *                   type:
    *                     type: string
    *                     enum:
    *                       - user
    *                       - pool
    *                       - award
    *                   offer:
    *                     type: object
    *                     description: Item quantities keyed by item ID (0 for digipogs).
    *                     additionalProperties:
    *                       type: integer
    *                       description: Quantity of the item.
    *                     example:
    *                       "0": 10
    *                       "2": 1200
    *                   pin:
    *                     type: string
    *                     description: 4-6 numeric user or pool pin
    *                     example: "1234"
    *               reason:
    *                 type: string
    *                 description: Reason for the exchange
    *     responses:
    *       200:
    *         description: Exchange completed successfully
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
    *                     exchangeId:
    *                       type: string
    *       201:
    *         description: Exchange pending approval
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
    *                     exchangeId:
    *                       type: string
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
    router.post("/exchanges", isAuthenticated, async (req, res) => {
        const { to, from } = req.body;

        requireBodyParam(to, "to");
        requireBodyParam(from, "from");

        from.userId = req.user.id;

        req.infoEvent("exchange.create.attempt", "Creating exchange", req.body);

        const { status, exchangeId } = await createExchange(req.body);

        res.status(status).json({ success: true, data: { exchangeId } });
    })
}
