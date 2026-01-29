const { logger } = require("@modules/logger");

module.exports = {
    run(socket, socketUpdates) {
        socket.on("classUpdate", () => {
            socketUpdates.classUpdate(socket.request.session.classId, { global: false });
        });

        socket.on("customPollUpdate", () => {
            socketUpdates.customPollUpdate(socket.request.session.email);
        });

        socket.on("classBannedUsersUpdate", () => {
            socketUpdates.classBannedUsersUpdate();
        });
    },
};
