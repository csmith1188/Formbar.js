const { logger } = require("@modules/logger");
const { httpPermCheck } = require("../middleware/permission-check");
const { classInformation } = require("@modules/class/classroom");
const { setTags } = require("@modules/class/tags");

module.exports = (router) => {
    try {
        // Get current class tags
        router.get("/room/tags", httpPermCheck("classUpdate"), async (req, res) => {
            try {
                const classId = req.session.user.classId;
                if (!classId || !classInformation.classrooms[classId]) {
                    return res.status(404).json({ error: "Class not found or not loaded." });
                }

                const tags = classInformation.classrooms[classId].tags || [];
                return res.status(200).json({ tags });
            } catch (err) {
                logger.log("error", err.stack);
                return res.status(500).json({ error: "There was a server error try again." });
            }
        });

        /**
         * @swagger
         * /api/v1/room/tags:
         *   post:
         *     summary: Set class tags
         *     tags:
         *       - Room
         *     description: Sets the tags for the current class
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               tags:
         *                 type: array
         *                 items:
         *                   type: string
         *     responses:
         *       200:
         *         description: Tags set successfully
         *       400:
         *         description: Tags must be an array
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
         *       500:
         *         description: Server error
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ServerError'
         */
        // Set class tags
        router.post("/room/tags", httpPermCheck("setTags"), async (req, res) => {
            try {
                const classId = req.session.user.classId;
                if (!classId || !classInformation.classrooms[classId]) {
                    return res.status(404).json({ error: "Class not found or not loaded." });
                }

                let { tags } = req.body || {};
                if (!Array.isArray(tags)) {
                    return res.status(400).json({ error: "tags must be an array of strings" });
                }

                setTags(tags, req.session.user);
            } catch (err) {
                logger.log("error", err.stack);
                return res.status(500).json({ error: "There was a server error try again." });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
