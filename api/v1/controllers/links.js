const { getClassLinks, isUserInClass } = require("@services/class-service");
const { isAuthenticated, isVerified, permCheck } = require("@modules/middleware/authentication");
const ValidationError = require("@errors/validation-error");
const ForbiddenError = require("@errors/forbidden-error");

module.exports = (router) => {
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
