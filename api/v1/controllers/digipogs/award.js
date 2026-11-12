const { hasClassScope, hasScope } = require("@middleware/permission-check");
const { SCOPES } = require("@modules/permissions");
const { awardDigipogs } = require("@services/digipog-service");
const { isAuthenticated } = require("@middleware/authentication");
const AppError = require("@errors/app-error");
const { requireBodyParam } = require("@modules/error-wrapper");

/**
 * Register award controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/digipogs/award:
     *   post:
     *     summary: Award digipogs to a user
     *     tags:
     *       - Digipogs
     *     description: |
     *       Awards digipogs to a user.
     *
     *       **Required Scope:** `class.digipogs.award` (granted to Teacher and Manager roles)
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               to:
     *                 oneOf:
     *                   - type: string
     *                     example: "user123"
     *                   - type: object
     *                     properties:
     *                       id:
     *                         type: string
     *                         example: "user123"
     *                       type:
     *                         type: string
     *                         enum: [user, class, pool]
     *                         example: "user"
     *                       code:
     *                         type: string
     *                         example: "ABCD12"
     *               userId:
     *                 type: string
     *                 example: "user123"
     *                 description: Legacy alias for user recipient
     *               studentId:
     *                 type: string
     *                 example: "user123"
     *                 description: Legacy alias for user recipient
     *               amount:
     *                 type: integer
     *                 example: 10
     *     responses:
     *       200:
     *         description: Digipogs awarded successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: Insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       500:
     *         description: Award failed
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.post("/digipogs/award", isAuthenticated, hasScope(SCOPES.GLOBAL.DIGIPOGS.AWARD), async (req, res) => {
        const { amount, to, userId, studentId } = req.body || {};

        if (amount === undefined || amount === null) {
            requireBodyParam(undefined, "amount");
        }

        if (!to && !userId && !studentId) {
            requireBodyParam(undefined, "to");
        }

        const awardPayload = {
            ...(req.body || {}),
            ...(to ? {} : { to: { id: userId || studentId, type: "user" } }),
        };

        req.infoEvent("digipogs.award.attempt", "Attempting to award digipogs", { amount, to: awardPayload.to });

        const result = await awardDigipogs(awardPayload, req.user);
        if (!result.success) {
            throw new AppError(result.message || "Digipogs award failed", {
                statusCode: result.statusCode || 400,
                event: "digipogs.award.failed",
                reason: "award_error",
            });
        }

        req.infoEvent("digipogs.award.success", "Digipogs awarded successfully", { amount, to: awardPayload.to });
        res.status(200).json({
            success: true,
            data: result,
        });
    });
};
