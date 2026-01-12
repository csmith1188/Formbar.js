const {getLinks, isUserInClass} = require("@services/class-service");
const { isAuthenticated, isVerified, permCheck } = require("@controllers/middleware/authentication");

module.exports = (router) => {

    router.get("/links", isAuthenticated, permCheck, isVerified, async (req, res) => {
        try {

            if (!req.query.classId) throw new Error("Missing classId parameter");
            if (!await isUserInClass(req.session.userId, req.query.classId)) throw new Error("You are not a member of this class");

            const classId = req.query.classId;
            const links = await getLinks(classId);

            res.send({links});
            
        } catch (err) {
            res.status(500).json({ error: `Failed to retrieve links: ${err.message}` });
        }
    });

}