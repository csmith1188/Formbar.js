const { updatePoolPin, poolTopHolderCheck } = require("@services/digipog-service");
const { isVerified, isAuthenticated } = require("@middleware/authentication");
const { SCOPES } = require("@modules/permissions");
const { isOwnerOrHasScopes } = require("@middleware/permission-check");
const { isValidPin } = require("@modules/pin-validation");
const ValidationError = require("@errors/validation-error");
const ForbiddenError = require("@errors/forbidden-error");
const { requireQueryParam } = require("@modules/error-wrapper");

/**
 * Register pin controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/pool/{id}/pin:
     *   patch:
     *     summary: Update pool PIN
     *     tags:
     *       - Pools
     *     description: |
     *       Updates the authenticated top holder's pool PIN. Requires the current PIN if one is already set.
     *       Top holders may only update their own pool PIN. The PIN must be 4-6 numeric digits.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         description: The ID of the pool whose PIN to update
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
     *               oldPin:
     *                 type: string
     *                 description: Current PIN (required if a PIN is already set)
     *                 example: "1234"
     *               pin:
     *                 type: string
     *                 description: New PIN (4-6 numeric digits)
     *                 example: "5678"
     *     responses:
     *       200:
     *         description: PIN updated successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                   example: "PIN updated successfully."
     *       400:
     *         description: Validation error (missing or invalid PIN format)
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       401:
     *         description: Current PIN is incorrect
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: Cannot modify pool if not top holder
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
    router.patch("/pool/:id/pin", 
        isAuthenticated, 
        isVerified, 
        isOwnerOrHasScopes(poolTopHolderCheck, SCOPES.GLOBAL.SYSTEM.ADMIN, "You do not have enough shares to own this pool."), 
        async (req, res) => {
            const targetPoolId = Number(req.params.id);
            requireQueryParam(targetPoolId, "id");

            const { oldPin, pin } = req.body;

            if (!isValidPin(pin)) {
                throw new ValidationError("Invalid PIN format. PIN must be 4-6 numeric digits.", {
                    event: "user.pin.update.failed",
                    reason: "invalid_pin_format",
                });
            }

            req.infoEvent("pool.pin.update.attempt", "Attempting to update pool PIN", { poolId: targetPoolId });
            await updatePoolPin(targetPoolId, oldPin, pin);

            req.infoEvent("pool.pin.update.success", "PIN updated successfully");
            res.status(200).json({
                success: true,
                data: {
                    message: "PIN updated successfully.",
                },
            });
        }
    );
};
