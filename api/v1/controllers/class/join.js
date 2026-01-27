const { httpPermCheck } = require("@modules/middleware/permissionCheck");
const { joinClass } = require("@modules/class/class");

module.exports = (router) => {
    // Joins the current class session
    router.post("/class/:id/join", httpPermCheck("joinClass"), async (req, res) => {
        await joinClass(req.session);
        res.status(200).json({ success: true });
    });
};
