const { SCOPES } = require("@modules/permissions");
const { hasScope, isOwnerOrHasScopes } = require("@middleware/permission-check");
const { isAuthenticated } = require("@middleware/authentication");
const { requireQueryParam, requireBodyParam } = require("@modules/error-wrapper");
const digipogService = require("@services/digipog-service");
const AppError = require("@errors/app-error");
const ValidationError = require("@errors/validation-error");

/**
 * Register payout controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/pools/{id}/payout:
     *   post:
     *     summary: Execute a payout for a digipog pool
     *     tags:
     *       - Pools
     *     description: |
     *       Executes a payout for a digipog pool, distributing the pool's digipogs to its members.
     *       Only the pool owner or a manager can execute a payout.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         description: The ID of the pool to pay out
     *         schema:
     *           type: integer
     *           example: 42
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - amount
     *               - payoutType
     *             properties:
     *               amount:
     *                 type: integer
     *                 description:  Amount to pay out of pool (percentage or set)
     *                 example: 60
     *               payoutType:
     *                 type: string
     *                 description:  Can either be "percent" or "set"
     *                 example: percent
     *     responses:
     *       200:
     *         description: Pool payout executed successfully
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
     *                   description: Result data from the payout operation
     *       400:
     *         description: Validation error (pool not found or payout failed)
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ValidationError'
     *       401:
     *         description: Unauthorized - user not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: Forbidden - user is not the pool owner or a manager
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
    router.post(
        "/pools/:id/payout",
        isAuthenticated,
        hasScope(SCOPES.GLOBAL.POOLS.MANAGE),
        isOwnerOrHasScopes(digipogService.poolOwnerCheck, SCOPES.GLOBAL.SYSTEM.ADMIN, "You do not own this pool."),
        async (req, res) => {
            const poolId = Number(req.params.id);
            const amount = Number(req.body.amount);
            const payoutType = req.body.payoutType;

            requireQueryParam(poolId, "poolId");
            requireBodyParam(amount, "amount");
            requireBodyParam(payoutType, "payoutType");

            req.infoEvent("pool.payout.attempt", "Attempting to pay out a pool", {
                poolId,
                actingUserId: req.user.id,
				amount,
				payoutType,
            });

            // Check if the pool exists
            const pool = await digipogService.getPoolById(poolId);
            if (!pool) {
                throw new ValidationError("Pool does not exist.", { event: "pool.payout.failed", reason: "pool_not_found" });
            }

            const result = await digipogService.payoutPool({
                actingUserId: req.user.id,
                poolId,
				amount,
				payoutType
            });

            if (!result.success) {
                throw new AppError(result.message, {
                    statusCode: 400,
                    event: "pool.payout.failed",
                    reason: "payout_error",
                });
            }

            req.infoEvent("pool.payout.success", "Pool payout completed successfully", {
                poolId,
                actingUserId: req.user.id,
				amount,
				payoutType
            });

            res.status(200).json({
                success: true,
                data: result,
            });
        }
    );
};
