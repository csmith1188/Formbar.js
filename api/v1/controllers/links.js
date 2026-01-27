const { getClassLinks, isUserInClass } = require("@services/class-service");
const { isAuthenticated, isVerified, permCheck } = require("@modules/middleware/authentication");
const ValidationError = require("@errors/validation-error");
const ForbiddenError = require("@errors/forbidden-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/links:
     *   get:
     *     summary: Get class links
     *     tags:
     *       - Class
     *     description: Returns all links associated with a specific class. User must be a member of the class.
     *     parameters:
     *       - in: query
     *         name: classId
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
    router.get("/links", isAuthenticated, permCheck, isVerified, async (req, res) => {
        if (!req.query.classId) {
            throw new ValidationError("Missing classId parameter");
        }
        const classId = parseInt(req.query.classId, 10);
        if (!Number.isInteger(classId) || classId <= 0) {
            throw new ValidationError("Invalid classId parameter");
        }
        if (!(await isUserInClass(req.session.user.id, classId))) {
            throw new ForbiddenError("You are not a member of this class");
        }

        const links = await getClassLinks(classId);

        res.send({ links });
    });
};
