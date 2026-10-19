const { isOwnerOrHasScopes } = require("@middleware/permission-check");
const { isAuthenticated } = require("@middleware/authentication");
const { SCOPES } = require("@modules/permissions");
const { updateClassSetting } = require("@services/class-service");
const { requireQueryParam } = require("@modules/error-wrapper");
const membershipService = require("@services/class-membership-service");

/**
 * Register settings controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/settings:
     *   patch:
     *     summary: Update class settings
     *     tags:
     *       - Class
     *     description: |
     *       Updates one or more mutable settings for an active class session.
     *
     *       **Required scope:** `class.session.settings`
     *
    *       Currently supported request fields:
    *       - `name`: Renames the class
    *       - `defaultRoleId`: Role ID automatically assigned to newly enrolled users; `null` clears it
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               name:
     *                 type: string
     *                 description: New class name
     *                 example: Algebra I
    *               defaultRoleId:
    *                 type: integer
    *                 nullable: true
    *                 description: Class role assigned to newly enrolled users
     *     responses:
     *       200:
     *         description: Class setting updated successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *       400:
     *         description: Missing class ID, unsupported setting field, or invalid value
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
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
     *       404:
     *         description: Class not started or not found
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
    router.patch(
        "/class/:id/settings",
        isAuthenticated,
        isOwnerOrHasScopes(
            membershipService.classroomOwnerCheck,
            SCOPES.CLASS.SESSION.SETTINGS,
            "You do not have permission to update this class's settings."
        ),
        async (req, res) => {
            const classId = req.params.id;
            const classSettings = req.body;
            requireQueryParam(classId, "id");

            req.infoEvent("class.settings.update", "Updating class settings", { classId, classSettings });

            await updateClassSetting(classId, classSettings);

            req.infoEvent("class.settings.updated", "Class settings updated", { classId, classSettings });

            res.status(200).json({ success: true });
        }
    );
};
