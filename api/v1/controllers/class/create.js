const { logger } = require("@modules/logger");
const { TEACHER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("@controllers/middleware/permissionCheck");
const classService = require("@services/class-service");
const { validateClassroomName } = require("@services/class-service");

module.exports = (router) => {
    /**
     * POST /api/class/create
     * Creates a new class
     * Body: {
     *   name: string (required)
     * }
     */
    router.post("/class/create", hasPermission(TEACHER_PERMISSIONS), async (req, res) => {
        try {
            const { name } = req.body;
            if (!name) {
                return res.status(400).json({ error: "Class name is required" });
            }

            const { valid, error } = validateClassroomName(name);
            if (!valid) {
                return res.status(400).json({ error });
            }

            const { userId, email: userEmail } = req.session;
            logger.log("info", `[post /class/create] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
            logger.log("verbose", `[post /class/create] className=(${name})`);

            const result = await classService.createClass(name, userId, userEmail);
            req.session.classId = result.classId;

            return res.status(200).json({
                message: "Class created successfully",
                ...result,
            });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "There was a server error. Please try again." });
        }
    });
};
