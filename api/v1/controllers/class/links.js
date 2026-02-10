const { getClassLinks, isUserInClass } = require("@services/class-service");
const { isAuthenticated, isVerified, permCheck } = require("@middleware/authentication");
const ValidationError = require("@errors/validation-error");
const ForbiddenError = require("@errors/forbidden-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/links:
     *   get:
     *     summary: Get class links
     *     tags:
     *       - Class
     *     description: Returns all links associated with a specific class. User must be a member of the class.
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         description: The ID of the class to retrieve links for
     *         schema:
     *           type: integer
     *           example: 1
     *     responses:
     *       200:
     *         description: Links retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 links:
     *                   type: array
     *                   items:
     *                     type: object
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.get("/class/:id/links", isAuthenticated, permCheck, isVerified, async (req, res) => {
        if (!req.params.id) {
            throw new ValidationError("Missing id parameter");
        }

        const classId = parseInt(req.params.id, 10);
        if (!Number.isInteger(classId) || classId <= 0) {
            throw new ValidationError("Invalid id parameter");
        }

        if (!(await isUserInClass(req.user.id, classId))) {
            throw new ForbiddenError("You are not a member of this class");
        }

        const links = await getClassLinks(classId);

        res.send({
            success: true,
            data: {
                links,
            },
        });
    });
};
