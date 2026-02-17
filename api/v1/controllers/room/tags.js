const { httpPermCheck } = require("@middleware/permission-check");
const { classInformation } = require("@modules/class/classroom");
const { setTags } = require("@modules/class/tags");
const { isAuthenticated } = require("@middleware/authentication");
const NotFoundError = require("@errors/not-found-error");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    const setTagsHandler = async (req, res) => {
        const classId = req.user.classId || req.user.activeClass;
        req.infoEvent("room.tags.update.attempt", "Attempting to update room tags", { classId });
        if (!classId || !classInformation.classrooms[classId]) {
            throw new NotFoundError("Class not found or not loaded.");
        }

        let { tags } = req.body || {};
        if (!Array.isArray(tags)) {
            throw new ValidationError("tags must be an array of strings");
        }

        setTags(tags, req.user);
        req.infoEvent("room.tags.update.success", "Room tags updated", { classId, tagCount: tags.length });
        res.status(200).json({
            success: true,
            data: {},
        });
    };

    /**
     * @swagger
     * /api/v1/room/tags:
     *   get:
     *     summary: Get current class tags
     *     tags:
     *       - Room
     *     description: |
     *       Returns the current tags for the classroom.
     *
     *       **Required Permission:** Class-specific `classUpdate` permission
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     responses:
     *       200:
     *         description: Tags retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 tags:
     *                   type: array
     *                   items:
     *                     type: string
     *                   example: ["math", "science"]
     *       404:
     *         description: Class not found or not loaded
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     */
    router.get("/room/tags", isAuthenticated, httpPermCheck("classUpdate"), async (req, res) => {
        const classId = req.user.classId || req.user.activeClass;
        req.infoEvent("room.tags.view.attempt", "Attempting to view room tags", { classId });
        if (!classId || !classInformation.classrooms[classId]) {
            throw new NotFoundError("Class not found or not loaded.");
        }

        const tags = classInformation.classrooms[classId].tags || [];
        req.infoEvent("room.tags.view.success", "Room tags returned", { classId, tagCount: tags.length });
        return res.status(200).json({
            success: true,
            data: {
                tags,
            },
        });
    });

    /**
     * @swagger
     * /api/v1/room/tags:
     *   put:
     *     summary: Set class tags
     *     tags:
     *       - Room
     *     description: |
     *       Sets (replaces) the tags for the current classroom.
     *
     *       **Required Permission:** Class-specific `setTags` permission
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
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
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
    router.put("/room/tags", isAuthenticated, httpPermCheck("setTags"), setTagsHandler);

    // Deprecated endpoint - kept for backwards compatibility, use PUT /api/v1/room/tags instead
    router.post("/room/tags", isAuthenticated, httpPermCheck("setTags"), async (req, res) => {
        res.setHeader("X-Deprecated", "Use PUT /api/v1/room/tags instead");
        res.setHeader("Warning", '299 - "Deprecated API: Use PUT /api/v1/room/tags instead. This endpoint will be removed in a future version."');
        await setTagsHandler(req, res);
    });
};
