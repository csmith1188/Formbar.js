const { dbGet, dbGetAll } = require("@modules/database");
const { isAuthenticated, isVerified } = require("@middleware/authentication");
const { isSelfOrHasScopes } = require("@middleware/permission-check");
const { SCOPES } = require("@modules/permissions");
const { buildPagination, parsePaginationQuery } = require("@modules/pagination");
const { requireQueryParam } = require("@modules/error-wrapper");
const pools = require("@services/digipog-service");

const DEFAULT_POOL_LIMIT = 20;
const MAX_POOL_LIMIT = 100;

/**
 * Register pools controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/user/{id}/pools:
     *   get:
     *     summary: Get a user's digipog pools
     *     tags:
     *       - Pools
     *     description: Returns paginated digipog pools that the user owns or is a member of.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         description: The ID of the user to retrieve pools for
     *         schema:
     *           type: integer
     *           example: 1
     *       - in: query
     *         name: limit
     *         required: false
     *         description: Number of pools to return per page
     *         schema:
     *           type: integer
     *           minimum: 1
     *           maximum: 100
     *           default: 20
     *       - in: query
     *         name: offset
     *         required: false
     *         description: Number of pools to skip before returning results
     *         schema:
     *           type: integer
     *           minimum: 0
     *           default: 0
     *     responses:
     *       200:
     *         description: Pools retrieved successfully
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
     *                     pools:
     *                       type: array
     *                       description: Array of pool objects the user owns or is a member of
     *                       items:
     *                         type: object
     *                         properties:
     *                           id:
     *                             type: integer
     *                           name:
     *                             type: string
     *                           description:
     *                             type: string
     *                             nullable: true
     *                           amount:
     *                             type: integer
     *                           shareItem:
     *                             type: integer
     *                           topShareholders:
     *                             type: array
     *                             items:
     *                               type: object
     *                               properties:
     *                                 id:
     *                                   type: integer
     *                                 displayName:
     *                                   type: string
     *                           members:
     *                             type: array
     *                             items:
     *                               type: object
     *                               properties:
     *                                 id:
     *                                   type: integer
     *                                 displayName:
     *                                   type: string
     *                         additionalProperties: true
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
     *       400:
     *         description: Validation error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ValidationError'
     *       403:
     *         description: Forbidden - user lacks permission to view another user's pools
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ForbiddenError'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.get(
        "/user/:id/pools",
        isAuthenticated,
        isVerified,
        isSelfOrHasScopes(SCOPES.GLOBAL.USERS.MANAGE, "You do not have permission to view this user's pools."),
        async (req, res) => {
            const userId = Number(req.params.id);
            requireQueryParam(userId, "id");

            req.infoEvent("user.pools.view.attempt", "Attempting to view user pools");

            const { limit, offset } = parsePaginationQuery(req.query, DEFAULT_POOL_LIMIT, MAX_POOL_LIMIT);

            const { pools: userPools, total } = await pools.getPoolsForUserPaginated(userId, limit, offset);
            const poolObjs = await Promise.all(
                userPools.map(async (poolData) => {
                    const pool = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [poolData.pool_id]);
                    let poolApiObject = null;
                    if (pool) {
                        const users = await pools.getUsersForPool(poolData.pool_id);
                        const userIds = users.map((u) => u.user_id);
                        const displayNameMap = {};
                        if (userIds.length > 0) {
                            const placeholders = userIds.map(() => "?").join(",");
                            const rows = await dbGetAll(`SELECT id, displayName FROM users WHERE id IN (${placeholders})`, userIds);
                            for (const row of rows) {
                                displayNameMap[row.id] = row.displayName;
                            }
                        }
                        
                        const shareholders = await dbGetAll("SELECT * FROM inventory WHERE item_id = ? ORDER BY quantity DESC", [pool.share_item]);
                        const topShareholderIds = [];
                        let maxQuantity = shareholders[0].quantity;
                        for (const shareholder of shareholders) {
                            if (shareholder.quantity < maxQuantity) break;
                            topShareholderIds.push(shareholder.user_id);
                        }

                        const members = users
                            .filter((userData) => !topShareholderIds.includes(userData.user_id))
                            .map((u) => ({
                                id: u.user_id,
                                displayName: displayNameMap[u.user_id] || "Unknown User",
                            }));
                        const topShareholders = users
                            .filter((userData) => topShareholderIds.includes(userData.user_id))
                            .map((u) => ({
                                id: u.user_id,
                                displayName: displayNameMap[u.user_id] || "Unknown User",
                            }));

                        poolApiObject = {
                            id: pool.id,
                            name: pool.name,
                            description: pool.description,
                            shareItem: pool.share_item,
                            amount: pool.amount,
                            topShareholders,
                            members,
                        };
                    }
                    return poolApiObject;
                })
            );

            const filteredPools = poolObjs.filter((pool) => pool != null);
            const pagination = buildPagination(total, limit, offset, filteredPools.length);

            req.infoEvent("user.pools.view.success", "User pools returned", {
                poolCount: filteredPools.length,
                totalPoolCount: total,
                limit,
                offset,
            });

            res.status(200).json({
                success: true,
                data: {
                    pools: filteredPools,
                    pagination,
                },
            });
        }
    );
};
