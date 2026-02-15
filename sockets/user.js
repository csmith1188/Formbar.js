const { logout } = require("@modules/user/user-session");
const { handleSocketError } = require("@modules/socket-error-handler");

module.exports = {
    run(socket, socketUpdates) {
        socket.on("getOwnedClasses", (email) => {
            socketUpdates.getOwnedClasses(email);
        });

        socket.on("logout", () => {
            try {
                logout(socket);
            } catch (err) {
                handleSocketError(err, socket, "logout");
            }
        });
    },
};
