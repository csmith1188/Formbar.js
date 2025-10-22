const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { leaveRoom } = require("../../../modules/class/class");

module.exports = {
    run(router) {
        // Leaves the classroom entirely
        // The user is no longer attached to the classroom
        router.post("/class/:id/leave", httpPermCheck("leaveRoom"), async (req, res) => {
            try {
                await leaveRoom(socket.request.session);
                res.status(200).json({ message: "Success" });
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    },
};
