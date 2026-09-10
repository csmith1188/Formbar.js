const { SCOPES } = require("@modules/permissions");
const { hasScope } = require("@middleware/permission-check");
const { userHasScope } = require("@modules/scope-resolver");
const { isAuthenticated } = require("@middleware/authentication");
const { requireBodyParam } = require("@modules/error-wrapper");
const digipogService = require("@services/digipog-service");
const ValidationError = require("@errors/validation-error");
const AppError = require("@errors/app-error");

/**
 * Register create controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/pools/create:
     *   post:
     *     summary: Create a new digipog pool
     *     tags:
     *       - Pools
     *     description: |
     *       Creates a new digipog pool at the cost of 10,000 digipogs (admins do not need pin). The authenticated user becomes the owner of the pool.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - name
     *               - description
     *             properties:
     *               name:
     *                 type: string
     *                 description: Name of the pool (1-50 characters)
     *                 minLength: 1
     *                 maxLength: 50
     *                 example: "Class Reward Pool"
     *               description:
     *                 type: string
     *                 description: Description of the pool (0-255 characters)
     *                 maxLength: 255
     *                 example: "Pool for rewarding student participation"
     *               pin:
     *                 type: string
     *                 example: "1234"
     *                 description: User's PIN for authentication
     *     responses:
     *       200:
     *         description: Pool created successfully
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
     *                     poolId:
     *                       type: integer
     *                       description: ID of the newly created pool
     *                       example: 42
     *       400:
     *         description: Validation error (invalid name/description/pin)
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
     *         description: Forbidden - user lacks required permissions
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
    router.post("/pools/create", isAuthenticated, hasScope(SCOPES.GLOBAL.POOLS.MANAGE), async (req, res) => {
        const { name, description, pin } = req.body;

        requireBodyParam(name, "name");
        requireBodyParam(description, "description");

        if (typeof name !== "string" || name.length <= 0 || name.length > 50) {
            throw new ValidationError("Invalid pool name.", { event: "pool.create.failed", reason: "invalid_name" });
        }

        if (typeof description !== "string" || description.length > 255) {
            throw new ValidationError("Invalid pool description.", { event: "pool.create.failed", reason: "invalid_description" });
        }

        // Admins exempt from cost
        if (!userHasScope(req.user, SCOPES.GLOBAL.SYSTEM.ADMIN)) {
            requireBodyParam(pin, "pin");
            if (typeof pin !== "string") {
                throw new ValidationError("Invalid pin.", { event: "pool.create.failed", reason: "invalid_pin" });
            }   
            // Charge digipogs
            const transferPayload = {
                from: { id: req.user.id, type: "user" },
                to: { id: 0, type: "pool" },
                pin: pin,
                amount: 10000,
                reason: "Pool Creation Fee"
            }
            const transferResult = await digipogService.transferDigipogs(transferPayload);

            if (!transferResult.success) {
                throw new AppError(transferResult.message, { statusCode: 400, event: "digipogs.transfer.failed", reason: "transfer_error" });
            }
        }

        // Create the pool
        const result = await digipogService.createPool({ name, description, ownerId: req.user.id });
        const poolId = result.lastID || result;

        res.status(200).send({
            success: true,
            data: {
                poolId: poolId,
            },
        });
    });
};
