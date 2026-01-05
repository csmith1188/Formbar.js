const { logger } = require("@modules/logger");
const { httpPermCheck } = require("../middleware/permissionCheck");
const { joinRoom } = require("@modules/class/class");

module.exports = (router) => {
    try {
        // Joins a classroom
        router.post("/room/:code/join", httpPermCheck("joinRoom"), async (req, res) => {
            try {
                await joinRoom(req.session, req.params.code);
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
