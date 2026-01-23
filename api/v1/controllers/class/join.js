const { logger } = require("@modules/logger");
const { httpPermCheck } = require("@modules/middleware/permissionCheck");
const { joinClass } = require("@modules/class/class");

module.exports = (router) => {
    try {
        // Joins the current class session
        router.post("/class/:id/join", httpPermCheck("joinClass"), async (req, res) => {
            joinClass(req.session);
            res.status(200).json({ message: "Success" });
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
