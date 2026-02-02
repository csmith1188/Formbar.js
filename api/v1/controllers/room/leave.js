const { httpPermCheck } = require("@middleware/permissionCheck");
const { leaveRoom } = require("@modules/class/class");

module.exports = (router) => {
    // Leaves the classroom entirely
    // The user is no longer attached to the classroom
    router.post("/class/:id/leave", httpPermCheck("leaveRoom"), async (req, res) => {
        await leaveRoom(req.session);
        res.status(200).json({ success: true });
    });
};
