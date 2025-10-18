const { requestBreak, approveBreak, endBreak } = require("../modules/class/break");

module.exports = {
    run(socket, socketUpdates) {
        // Sends a break ticket
        socket.on("requestBreak", async (reason) => {
            const result = await requestBreak(reason, socket.request.session);
            if (result !== true) {
                socket.emit("message", result);
            }
        });

        // Approves the break ticket request
        socket.on("approveBreak", (breakApproval, userId) => {
            approveBreak(breakApproval, userId, socket.request.session);
        });

        // Ends the break
        socket.on("endBreak", () => {
            endBreak(socket.request.session);
        });
    },
};
