const { database } = require("../modules/database")
const { logger } = require("../modules/logger")

module.exports = {
    run(socket, socketUpdates) {
        socket.on("approvePasswordChange", (changeApproval, username, newPassword) => {
            try {
                if (changeApproval) {
                    const passwordCrypt = hash(newPassword);
                    const passwordCryptString = JSON.stringify(passwordCrypt);
                    database.run("UPDATE users SET password = ? WHERE username = ?", [passwordCryptString, username], (err) => {
                        if (err) {
                            logger.log("error", err.stack);
                        };
                    });
                };
            } catch (err) {
                logger.log("error", err.stack);
            };
        });
    }
};