const { dbGetAll } = require("@modules/database");
const { logger } = require("@modules/logger");
const { hasClassPermission } = require("@modules/middleware/permissionCheck");
const { classInformation } = require("@modules/class/classroom");
const { TEACHER_PERMISSIONS } = require("@modules/permissions");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    // Get banned users for a class
    router.get("/class/:id/banned", hasClassPermission(TEACHER_PERMISSIONS), async (req, res) => {
        const classId = req.params.id;
        logger.log("info", `[get api/class/${classId}/banned] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

        // Ensure class exists
        if (!classInformation.classrooms[classId]) {
            throw new NotFoundError("Class not started");
        }

        const rows = await dbGetAll(
            "SELECT users.id, users.email, users.displayName FROM classusers JOIN users ON users.id = classusers.studentId WHERE classusers.classId=? AND classusers.permissions=0",
            [classId]
        );
        res.status(200).json(rows || []);
    });
};
