const { isAuthenticated, isVerified } = require("@middleware/authentication");
const { requireBodyParam } = require("@modules/error-wrapper");
const { createTrade } = require("@services/trade-service");
const ValidationError = require("@errors/validation-error");

/**
 * Register trades create controller routes.
 * @param {import("express").Router} router
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/trades:
     *   post:
     *     summary: Create a trade. This endpoint is deprecated. Use the endpoints under the Exchanges tag.
     *     deprecated: true
     *     description: >
     *       Creates a new pending trade between the authenticated user (requester) and
     *       another user (recipient). Each side specifies exactly one source: `inventory`
     *       for item stacks or `pool` for digipogs. Assets are not reserved at creation
     *       time; acceptance re-checks availability atomically.
     *     tags: [Trades]
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [toUserId, offered, requested]
     *             properties:
     *               toUserId:
     *                 type: integer
     *                 example: 2
     *               offered:
     *                 type: object
     *                 required: [source]
     *                 properties:
     *                   source:
     *                     type: object
     *                     required: [type]
     *                     properties:
     *                       type:
     *                         type: string
     *                         enum: [inventory, pool]
     *                       poolId:
     *                         type: integer
     *                   items:
     *                     type: array
     *                     items:
     *                       type: object
     *                       properties:
     *                         itemId:
     *                           type: integer
     *                         quantity:
     *                           type: integer
     *                   digipogs:
     *                     type: integer
     *               requested:
     *                 type: object
     *                 required: [source]
     *                 properties:
     *                   source:
     *                     type: object
     *                     required: [type]
     *                     properties:
     *                       type:
     *                         type: string
     *                         enum: [inventory, pool]
     *                       poolId:
     *                         type: integer
     *                   items:
     *                     type: array
     *                     items:
     *                       type: object
     *                       properties:
     *                         itemId:
     *                           type: integer
     *                         quantity:
     *                           type: integer
     *                   digipogs:
     *                     type: integer
     *     responses:
     *       200:
     *         description: Trade created successfully
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
     *                     tradeId:
     *                       type: integer
     *       400:
     *         description: Validation error
     *       401:
     *         description: Not authenticated
     *       404:
     *         description: Recipient user not found
     */
    router.post("/trades", isAuthenticated, isVerified, async (req, res) => {
        const { toUserId, offered, requested } = req.body;

        requireBodyParam(toUserId, "toUserId");
        requireBodyParam(offered, "offered");
        requireBodyParam(requested, "requested");

        const parsedToUserId = Number(toUserId);
        if (!Number.isInteger(parsedToUserId) || parsedToUserId <= 0) {
            throw new ValidationError("toUserId must be a positive integer.", { reason: "invalid_to_user_id" });
        }

        req.infoEvent("trades.create", "Creating trade", { fromUserId: req.user.id, toUserId: parsedToUserId });

        const { tradeId } = await createTrade({
            fromUserId: req.user.id,
            toUserId: parsedToUserId,
            offered,
            requested,
        });

        res.status(200).json({ success: true, data: { tradeId } });
    });
};
