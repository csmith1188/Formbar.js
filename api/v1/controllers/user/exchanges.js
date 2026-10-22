const { isAuthenticated, isVerified } = require("@middleware/authentication");
const { getExchangesForUser } = require("@services/exchange-service");
const { getUserDataFromDb } = require("@services/user-service");
const { requireQueryParam } = require("@modules/error-wrapper");
const { parsePaginationQuery } = require("@modules/pagination");
const NotFoundError = require("@errors/not-found-error");
const ForbiddenError = require("@errors/forbidden-error");

const DEFAULT_EXCHANGE_LIMIT = 20;
const MAX_EXCHANGE_LIMIT = 100;

/**
 * Register exchanges list controller routes.
 * @param {import("express").Router} router
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/user/{id}/exchanges:
     *   get:
     *     summary: List the user's exchanges
     *     description: >
     *       Returns the user's exchanges based on metadata filters
     *     tags: [Exchanges, Users]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *           default: 20
     *         description: Maximum number of exchanges per bucket
     *       - in: query
     *         name: offset
     *         schema:
     *           type: integer
     *           default: 0
     *         description: Number of exchanges to skip per bucket
     *       - in: query
     *         name: filters
     *         schema:
     *           type: array
     *           items:
     *             type: string
     *             enum:
     *               - completed
     *               - pending
     *               - canceled
     *               - rejected
     *               - inactive
     *               - trade
     *               - transaction
     *               - inbound
     *               - outbound
     *               - included
     *           style: form
     *           explode: false
     *           description: Filters results based on specific criteria. Multiple filters can be chained by separating them with commas.
     *           default: 'included'
     *     responses:
     *       200:
     *         description: exchange buckets returned successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: array
     *                   items:
     *                     inbound:
     *                       $ref: '#/components/schemas/Exchange'
     *       401:
     *         description: Not authenticated
     *       403:
     *         description: Not able to view other users exchanges
     */
    router.get("/user/:id/exchanges", isAuthenticated, isVerified, async (req, res) => {
        const userId = Number(req.params.id);
        requireQueryParam(userId, "id");

        if (req.user.id !== userId) {
            throw new ForbiddenError("You can only view your own exchanges.", { event: "user.exchanges.list.failed", reason: "forbidden" });
        }

        const { limit, offset } = parsePaginationQuery(req.query, DEFAULT_EXCHANGE_LIMIT, MAX_EXCHANGE_LIMIT);
        const filters = req.query.filter?.split(",").map((filter) => filter.trim());
        const requestedUser = await getUserDataFromDb(userId);
        if (!requestedUser) {
            throw new NotFoundError("User not found.", { event: "user.exchanges.list.failed", reason: "user_not_found" });
        }

        req.infoEvent("user.exchanges.list.attempt", "Attempting to list user exchanges", { userId: userId });

        const buckets = await getExchangesForUser(userId, { limit, offset, filters });
        req.infoEvent("user.trades.list.success", "User trades listed successfully", { userId: userId });
        res.status(200).json({ success: true, data: buckets });
    });
};
