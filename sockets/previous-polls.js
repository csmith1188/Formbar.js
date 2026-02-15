const { dbGet, dbGetAll } = require("@modules/database");
const { handleSocketError } = require("@modules/socket-error-handler");

module.exports = {
    run(socket, socketUpdates) {
        // Retrieves 20 previous polls from the database at a time
        // The index is the start of the next 20 polls to retrieve
        socket.on("getPreviousPolls", async (index) => {
            try {
                const classId = socket.request.session.classId;
                const totalPolls = await dbGet("SELECT COUNT(*) as count FROM poll_history WHERE class = ?", [classId]);
                const previousPolls = await dbGetAll("SELECT * FROM poll_history WHERE class = ? ORDER BY id DESC LIMIT ?, 20", [classId, index]);

                socket.emit("getPreviousPolls", previousPolls, totalPolls.count);
            } catch (err) {
                handleSocketError(err, socket, "getPreviousPolls");
            }
        });
    },
};
