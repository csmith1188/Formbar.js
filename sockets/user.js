const { logger } = require("@modules/logger");
const { logout } = require("@modules/user/user-session");

module.exports = {
    run(socket, socketUpdates) {
        socket.on("getOwnedClasses", (email) => {
            socketUpdates.getOwnedClasses(email);
        });

        socket.on("logout", () => {
            try {
                logout(socket);
            } catch (err) {
            }
        });
    },
};
