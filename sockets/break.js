const { requestBreak, approveBreak, endBreak } = require("../modules/class/break");

module.exports = {
    run(socket, socketUpdates) {
        // Sends a break ticket
        socket.on('requestBreak', (reason) => {
            requestBreak(reason, socket.request.session);
        });

        // Approves the break ticket request
        socket.on('approveBreak', async (breakApproval, userId) => {
            approveBreak(breakApproval, userId, socket.request.session);
        })

        // Ends the break
        socket.on('endBreak', () => {
            endBreak(socket.request.session);
        })
    }
}