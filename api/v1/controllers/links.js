const {getClassLinks, isUserInClass} = require("@services/class-service");
const { isAuthenticated, isVerified, permCheck } = require("@controllers/middleware/authentication");

module.exports = (router) => {

    router.get("/links", isAuthenticated, permCheck, isVerified, async (req, res) => {
        try {

            if (!req.query.classId) throw new Error("Missing classId parameter");
            const classId = parseInt(req.query.classId, 10);
            if (!Number.isInteger(classId) || classId <= 0) {
                throw new Error("Invalid classId parameter");
            }
            if (!await isUserInClass(req.session.user.id, classId)) throw new Error("You are not a member of this class");

            const links = await getClassLinks(classId);

            res.send({links});
            
        } catch (err) {
            console.log(err);
            res.status(500).json({ error: `Server error. Please try again` });
        }
    });

}