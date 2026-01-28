const { httpPermCheck } = require("@modules/middleware/permissionCheck");
const { joinRoom } = require("@modules/class/class");

module.exports = (router) => {
    // Joins a classroom
    router.post("/room/:code/join", httpPermCheck("joinRoom"), async (req, res) => {
        await joinRoom(req.session, req.params.code);
    });
};
