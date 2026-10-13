const { SCOPES } = require("@modules/permissions");
const { hasScope, isOwnerOrHasScopes } = require("@middleware/permission-check");
const { isAuthenticated } = require("@middleware/authentication");
const { requireBodyParam, requireQueryParam } = require("@modules/error-wrapper");
const digipogService = require("@services/digipog-service");
const AppError = require("@errors/app-error");
const ValidationError = require("@errors/validation-error");

/**
 * Register add-member controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/pools/{id}/add-member:
     *   post:
     *     summary: Add a member to a digipog pool
     *     tags:
     *       - Pools
     *     description: |
     *       Adds a user to a digipog pool as a member. Only the pool owner or a manager can add members.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         description: The ID of the pool
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
     *               - userId
     *             properties:
     *               userId:
     *                 type: integer
     *                 description: ID of the user to add to the pool
     *                 example: 5
     *     responses:
     *       200:
     *         description: Member added to pool successfully
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
     *                   description: Result data from the add member operation
     *       400:
     *         description: Validation error (pool not found, invalid user ID, or add member failed)
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
        "/pools/:id/add-member",
        isAuthenticated,
        hasScope(SCOPES.GLOBAL.POOLS.MANAGE),
        isOwnerOrHasScopes(digipogService.poolTopHolderCheck, SCOPES.GLOBAL.SYSTEM.ADMIN, "You do not own this pool."),
        async (req, res) => {
            const poolId = Number(req.params.id);
            let { userId } = req.body || {};

            requireQueryParam(poolId, "poolId");
            requireBodyParam(userId, "userId");
            userId = Number(userId);

            req.infoEvent("pool.add_member.attempt", "Attempting to add a user to a pool", {
                poolId,
                userId,
                actingUserId: req.user.id,
            });

            // Check if the pool exists
            const pool = await digipogService.getPoolById(poolId);
            if (!pool) {
                throw new ValidationError("Pool does not exist.", { event: "pool.add_member.failed", reason: "pool_not_found" });
            }

            const result = await digipogService.addMemberToPool({
                actingUserId: req.user.id,
                poolId,
                userId,
            });

            if (!result.success) {
                throw new AppError(result.message, {
                    statusCode: 400,
                    event: "pool.add_member.failed",
                    reason: "add_member_error",
                });
            }

            req.infoEvent("pool.add_member.success", "User added to pool successfully", {
                poolId,
                userId,
                actingUserId: req.user.id,
            });

            res.status(200).json({
                success: true,
                data: result,
            });
        }
    );
};
