const { verifyPoolPin, poolTopHolderCheck } = require("@services/digipog-service");
const { isVerified, isAuthenticated } = require("@middleware/authentication");
const { isValidPin } = require("@modules/pin-validation");
const { SCOPES } = require("@modules/permissions");
const { isOwnerOrHasScopes } = require("@middleware/permission-check");
const { requireQueryParam } = require("@modules/error-wrapper");
const ValidationError = require("@errors/validation-error");
const ForbiddenError = require("@errors/forbidden-error");

/**
 * Register verify controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/pool/{id}/pin/verify:
     *   post:
     *     summary: Verify pool PIN for sensitive actions
     *     tags:
     *       - Pools
     *     description: |
     *       Verifies the authenticated user's pool PIN before unlocking sensitive information.
     *       Users may only verify the PIN for any pools they are the top holder in.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         description: The ID of the pool whose PIN to verify
     *         schema:
     *           type: string
     *           example: "1"
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
     *                 description: Pool PIN (4-6 numeric digits)
     *                 example: "1234"
     *     responses:
     *       200:
     *         description: PIN verified successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                   example: "PIN verified successfully."
     *       400:
     *         description: Validation error (invalid PIN format or PIN not configured)
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       401:
     *         description: PIN is incorrect
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: Cannot verify another user's PIN
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
    router.post("/pool/:id/pin/verify", 
        isAuthenticated, 
        isVerified, 
        isOwnerOrHasScopes(poolTopHolderCheck, SCOPES.GLOBAL.SYSTEM.ADMIN, "You do not have enough shares to own this pool."),
        async (req, res) => {
            const targetPoolId = Number(req.params.id);
            requireQueryParam(targetPoolId, "id");

            const { pin } = req.body || {};
            if (!isValidPin(pin)) {
                throw new ValidationError("Invalid PIN format. PIN must be 4-6 numeric digits.", {
                    event: "pool.pin.verify.failed",
                    reason: "invalid_pin_format",
                });
            }

            req.infoEvent("pool.pin.verify.attempt", "Attempting to verify PIN", { poolId: targetPoolId });
            await verifyPoolPin(targetPoolId, pin);

            req.infoEvent("pool.pin.verify.success", "PIN verified successfully", { poolId: targetPoolId });
            res.status(200).json({
                success: true,
                data: {
                    message: "PIN verified successfully.",
                },
            });
        }
    );
};
