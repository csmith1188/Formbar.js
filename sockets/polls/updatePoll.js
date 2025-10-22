const { logger } = require("../../modules/logger");
const { classInformation } = require("../../modules/class/classroom");
const { updatePoll } = require("../../modules/polls");

module.exports = {
    run(socket, socketUpdates) {
        /**
         * Updates poll properties dynamically
         * @param {Object} options - Poll properties to update
         *
         * Examples:
         * socket.emit("updatePoll", {status: false}); // Ends poll
         * socket.emit("updatePoll", {studentsAllowedToVote: ['1', '2']}); // Changes who can vote
         * socket.emit("updatePoll", {blind: true}); // Makes poll blind
         * socket.emit("updatePoll", {}); // Clears the entire poll
         */
        socket.on("updatePoll", async (options) => {
            try {
                logger.log(
                    "info",
                    `[updatePoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)}) options=(${JSON.stringify(options)})`
                );
                const email = socket.request.session.email;
                const classId = classInformation.users[email]?.activeClass;
                if (!classId) {
                    logger.log("info", "[updatePoll socket] User not in a class");
                    socket.emit("message", "You are not in a class");
                    return;
                }

                if (!options || typeof options !== "object") {
                    logger.log("info", "[updatePoll socket] Invalid options");
                    socket.emit("message", "Invalid poll update options");
                    return;
                }

                const result = await updatePoll(classId, options, socket.request.session);
                if (result) {
                    logger.log("verbose", `[updatePoll socket] Poll updated successfully`);
                } else {
                    logger.log("info", `[updatePoll socket] Poll update failed`);
                    socket.emit("message", "Failed to update poll");
                }
            } catch (err) {
                logger.log("error", err.stack);
                socket.emit("message", "An error occurred while updating the poll");
            }
        });
    },
};
