const { logger } = require("@modules/logger");
const { logout } = require("@modules/user/userSession");

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
