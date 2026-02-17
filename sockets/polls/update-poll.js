const { classInformation } = require("@modules/class/classroom");
const { updatePoll } = require("@services/poll-service");

module.exports = {
    run(socket, socketUpdates) {
        /**
         * Updates poll properties dynamically
         * @param {Object} options - Poll properties to update
         *
         * Examples:
         * socket.emit("updatePoll", {status: false}); // Ends poll
         * socket.emit("updatePoll", {excludedRespondents: [1, 2]}); // Changes who can vote
         * socket.emit("updatePoll", {blind: true}); // Makes poll blind
         * socket.emit("updatePoll", {}); // Clears the entire poll
         */
        socket.on("updatePoll", async (options) => {
            try {
                const email = socket.request.session.email;
                const classId = classInformation.users[email]?.activeClass;
                if (!classId) {
                    socket.emit("message", "You are not in a class");
                    return;
                }

                if (!options || typeof options !== "object") {
                    socket.emit("message", "Invalid poll update options");
                    return;
                }

                const result = await updatePoll(classId, options, socket.request.session);
                if (result) {
                } else {
                    socket.emit("message", "Failed to update poll");
                }
            } catch (err) {
                socket.emit("message", "An error occurred while updating the poll");
            }
        });
    },
};
