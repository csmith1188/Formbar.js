const { sendHelpTicket, deleteHelpTicket } = require("../modules/class/help");

module.exports = {
    run(socket, socketUpdates) {
        // Sends a help ticket
        socket.on('help', (reason) => {
            sendHelpTicket(reason, socket.request.session);
        })

        // Deletes help ticket
        socket.on('deleteTicket', async (studentId) => {
            deleteHelpTicket(studentId, socket.request.session);
        })
    }
}