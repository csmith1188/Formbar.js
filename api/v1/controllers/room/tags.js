const { httpPermCheck } = require("@middleware/permissionCheck");
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

    // Set class tags
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
