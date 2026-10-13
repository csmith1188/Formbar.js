const { SCOPES } = require("@modules/permissions");
const { hasScope, isOwnerOrHasScopes } = require("@middleware/permission-check");
const { isAuthenticated } = require("@middleware/authentication");
const { requireQueryParam } = require("@modules/error-wrapper");
const digipogService = require("@services/digipog-service");
const ValidationError = require("@errors/validation-error");

/**
 * Register delete controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/pools/{id}:
     *   delete:
     *     summary: Delete a digipog pool
     *     tags:
     *       - Pools
     *     description: |
     *       Deletes a digipog pool. Only the pool owner or a manager can delete a pool.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         description: The ID of the pool to delete
     *         schema:
     *           type: integer
     *           example: 42
     *     responses:
     *       200:
     *         description: Pool deleted successfully
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
     *                   example: {}
     *       400:
     *         description: Validation error (invalid pool ID)
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
     *         description: Forbidden - user is not the pool owner or a manager, or pool does not exist
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
    router.delete(
        "/pools/:id",
        isAuthenticated,
        hasScope(SCOPES.GLOBAL.POOLS.MANAGE),
        isOwnerOrHasScopes(digipogService.poolTopHolderCheck, SCOPES.GLOBAL.SYSTEM.ADMIN, "You do not own this pool."),
        async (req, res) => {
            const poolId = Number(req.params.id);

            requireQueryParam(poolId, "poolId");

            if (typeof poolId !== "number" || poolId <= 0) {
                throw new ValidationError("Invalid pool ID.", { event: "pool.delete.failed", reason: "invalid_pool_id" });
            }

            // Check if the pool exists
            const pool = await digipogService.getPoolById(poolId);
            if (!pool) {
                throw new ValidationError("Pool does not exist.", { event: "pool.delete.failed", reason: "pool_not_found" });
            }

            await digipogService.deletePool(poolId);

            res.status(200).send({
                success: true,
                data: {},
            });
        }
    );
};
