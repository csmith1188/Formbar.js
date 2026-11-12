const { dbGet, dbGetAll } = require("@modules/database");
const { isAuthenticated, isVerified } = require("@middleware/authentication");
const { isSelfOrHasScopes } = require("@middleware/permission-check");
const { SCOPES } = require("@modules/permissions");
const { buildPagination, parsePaginationQuery } = require("@modules/pagination");
const { requireQueryParam } = require("@modules/error-wrapper");
const pools = require("@services/digipog-service");
const ValidationError = require("@errors/validation-error");
const userService = require("@services/user-service");
const { settings } = require("@modules/config");
const AppError = require("@errors/app-error");
const AuthError = require("@errors/auth-error");
const { isValidPin } = require("@modules/pin-validation");

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

    /**
     * @swagger
     * /api/v1/pool/{id}/reset:
     *   post:
     *     summary: Request pin reset email for a digipog pool
     *     tags:
     *       - Authentication
     *     description: Sends a pin reset email to the specified email address
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         description: The ID of the user to retrieve pools for
     *         schema:
     *           type: integer
     *           example: 1
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - email
     *             properties:
     *               email:
     *                 type: string
     *                 format: email
     *     responses:
     *       200:
     *         description: Pool pin reset email sent
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *       400:
     *         description: Email is required
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       503:
     *         description: Email service not enabled
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.post("/pool/:id/reset", async (req, res) => {
        const { email } = req.body || {};
        const id = Number(req.params.id);
        requireQueryParam(id, "id");

        if (!email) {
            throw new ValidationError("Email is required.", { event: "user.poolPin.reset.request.failed", reason: "missing_email" });
        }

        if (!id) {
            throw new ValidationError("Pool id is required.", { event: "user.poolPin.reset.request.failed", reason: "missing_pool_id" });
        }

        const user = await dbGet("SELECT id FROM users WHERE email = ?", [String(email).trim().toLowerCase()]);

        if (!user) {
            throw new AuthError("User is not authorized for this pool.", {
                event: "user.poolPin.reset.request.failed",
                reason: "user_not_found",
            });
        }

        const topHolder = await pools.isPoolUserTopHolder(id, user.id);

        if (!topHolder) {
            throw new AuthError("User is not the top share holder.", {
                event: "user.poolPin.reset.request.failed",
                reason: "not_top_share_holder",
            });
        }

        if (!settings.emailEnabled) {
            throw new AppError("Email service is not enabled. Pin resets are not available at this time.", {
                statusCode: 503,
                event: "user.poolPin.reset.request.failed",
                reason: "email_disabled",
            });
        }

        req.infoEvent("user.poolPin.reset.request", "Pool pin reset requested");
        await userService.requestPoolPinReset(email, id);

        req.infoEvent("user.poolPin.reset.request.success", "Pool Pin reset email sent");

        res.status(200).json({
            success: true,
            data: {
                message: "Pool pin reset email has been sent.",
            },
        });
    });

    /**
     * @swagger
     * /api/v1/pool/{id}/pin/reset:
     *   patch:
     *     summary: Reset pool pin with token
     *     tags:
     *       - Authentication
     *     description: |
     *       Resets a user's pool pin using a token received via email.
     *
     *       **Required Permission:** None (public endpoint, requires valid reset token)
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - pin
     *               - confirmPin
     *               - token
     *             properties:
     *               pin:
     *                 type: string
     *                 format: password
     *                 description: New pool pin
     *               confirmPin:
     *                 type: string
     *                 format: password
     *                 description: Confirmation of new pin
     *               token:
     *                 type: string
     *                 description: Pool pin reset token received via email
     *     responses:
     *       200:
     *         description: Pool pin reset successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                   example: "Pool pin has been reset successfully."
     *       400:
     *         description: Validation error (missing fields or pins don't match)
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.patch("/pool/:id/pin/reset", async (req, res) => {
        const { pin, confirmPin, token } = req.body || {};
        const poolId = Number(req.params.id);
        requireQueryParam(poolId, "id");
        if (!pin || !confirmPin) {
            throw new ValidationError("Pool pin and confirm pin are required.", {
                event: "user.poolPin.reset.failed",
                reason: "missing_fields",
            });
        }

        if (!token) {
            throw new ValidationError("Token is required.", { event: "user.poolPin.reset.failed", reason: "missing_token" });
        }

        if (pin !== confirmPin) {
            throw new ValidationError("Pins do not match.", { event: "user.poolPin.reset.failed", reason: "password_mismatch" });
        }

        if (!isValidPin(pin)) {
            throw new ValidationError("Invalid PIN format. PIN must be 4-6 numeric digits.", {
                event: "user.poolPin.reset.failed",
                reason: "invalid_pin_format",
            });
        }

        req.infoEvent("user.poolPin.reset.attempt", "Attempting to reset pool pin with token");
        await userService.resetPoolPin(pin, token, poolId);

        req.infoEvent("user.poolPin.reset.success", "Pool pin reset successfully");
        res.status(200).json({
            success: true,
            data: {
                message: "Pool pin has been reset successfully.",
            },
        });
    });
};
