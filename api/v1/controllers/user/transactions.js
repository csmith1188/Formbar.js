const { isVerified, isAuthenticated } = require("@middleware/authentication");
const { isSelfOrHasScopes } = require("@middleware/permission-check");
const { SCOPES } = require("@modules/permissions");
const { buildPagination, parsePaginationQuery } = require("@modules/pagination");
const { getUserDataFromDb } = require("@services/user-service");
const { getUserTransactionsPaginated } = require("@services/digipog-service");
const NotFoundError = require("@errors/not-found-error");
const { requireQueryParam } = require("@modules/error-wrapper");

const DEFAULT_TRANSACTION_LIMIT = 25;
const MAX_TRANSACTION_LIMIT = 100;

/**
 * Register transactions controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/user/{id}/transactions:
     *   get:
     *     summary: Get user transaction history. This endpoint is deprecated. Use the endpoints under the Exchanges tag.
     *     deprecated: true
     *     tags:
     *       - Users
     *     description: Returns the transaction history for a user. Users can view their own transactions, or managers can view any user's transactions.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: false
     *         description: The ID of the user to retrieve transactions for (defaults to current user)
     *         schema:
     *           type: string
     *           example: "1"
     *       - in: query
     *         name: limit
     *         required: false
     *         description: Number of transactions to return per page
     *         schema:
     *           type: integer
     *           minimum: 1
     *           maximum: 100
     *           default: 25
     *       - in: query
     *         name: offset
     *         required: false
     *         description: Number of transactions to skip before returning results
     *         schema:
     *           type: integer
     *           minimum: 0
     *           default: 0
     *     responses:
     *       200:
     *         description: Transactions retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 data:
     *                   type: object
     *                   properties:
     *                     transactions:
     *                       type: array
     *                       items:
     *                         type: object
     *                         additionalProperties: true
     *                     displayName:
     *                       type: string
     *                     currentUserId:
     *                       type: integer
     *                     pagination:
     *                       type: object
     *                       properties:
     *                         total:
     *                           type: integer
     *                         limit:
     *                           type: integer
     *                         offset:
     *                           type: integer
     *                         hasMore:
     *                           type: boolean
     *       403:
     *         description: Forbidden - insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       404:
     *         description: User not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.get(
        "/user/:id/transactions",
        isAuthenticated,
        isVerified,
        isSelfOrHasScopes(SCOPES.GLOBAL.USERS.MANAGE, "You do not have permission to view these transactions."),
        async (req, res) => {
            const userId = Number(req.params.id);
            requireQueryParam(userId, "id");

            const userData = await getUserDataFromDb(userId);
            if (!userData) {
                throw new NotFoundError("User not found.", { event: "user.transactions.view.failed", reason: "user_not_in_database" });
            }

            req.infoEvent("user.transactions.view.attempt", "Attempting to view user transactions", { targetUserId: userId });

            const { limit, offset } = parsePaginationQuery(req.query, DEFAULT_TRANSACTION_LIMIT, MAX_TRANSACTION_LIMIT);

            const userDisplayName = userData.displayName || "Unknown User";
            const { transactions, total } = await getUserTransactionsPaginated(userId, limit, offset);
            const pagination = buildPagination(total, limit, offset, transactions.length);

            if (!transactions || transactions.length === 0) {
                req.infoEvent("user.transactions.empty", "No transactions found for user");
                res.status(200).json({
                    success: true,
                    data: {
                        transactions: [],
                        displayName: userDisplayName,
                        currentUserId: req.user.id,
                        pagination,
                    },
                });
                return;
            }

            req.infoEvent("user.transactions.view.success", "User transactions returned", {
                targetUserId: userId,
                returnedCount: transactions.length,
                totalCount: total,
                limit,
                offset,
            });

            res.status(200).json({
                success: true,
                data: {
                    transactions: transactions,
                    displayName: userDisplayName,
                    currentUserId: req.user.id,
                    pagination,
                },
            });
        }
    );
};
