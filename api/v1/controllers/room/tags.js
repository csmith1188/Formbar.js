const { httpPermCheck } = require("@modules/middleware/permission-check");
const { classInformation } = require("@modules/class/classroom");
const { setTags } = require("@modules/class/tags");
const NotFoundError = require("@errors/not-found-error");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    // Get current class tags
    router.get("/room/tags", httpPermCheck("classUpdate"), async (req, res) => {
        const classId = req.session.user.classId;
        if (!classId || !classInformation.classrooms[classId]) {
            throw new NotFoundError("Class not found or not loaded.");
        }

        const tags = classInformation.classrooms[classId].tags || [];
        return res.status(200).json({ tags });
    });

    /**
     * @swagger
     * /api/v1/room/tags:
     *   post:
     *     summary: Set class tags
     *     tags:
     *       - Room
     *     description: Sets the tags for the current classroom
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - tags
     *             properties:
     *               tags:
     *                 type: array
     *                 items:
     *                   type: string
     *                 example: ["math", "science"]
     *     responses:
     *       200:
     *         description: Tags set successfully
     *       400:
     *         description: Tags must be an array of strings
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       404:
     *         description: Class not found or not loaded
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     */
    router.post("/room/tags", httpPermCheck("setTags"), async (req, res) => {
        const classId = req.session.user.classId;
        if (!classId || !classInformation.classrooms[classId]) {
            throw new NotFoundError("Class not found or not loaded.");
        }

        let { tags } = req.body || {};
        if (!Array.isArray(tags)) {
            throw new ValidationError("tags must be an array of strings");
        }

        setTags(tags, req.session.user);
    });
};
