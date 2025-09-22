const { sendHelpTicket, deleteHelpTicket } = require("../modules/class/help");

module.exports = {
    run(socket, socketUpdates) {
        // Sends a help ticket
        socket.on('help', async (reason) => {
            const result = await sendHelpTicket(reason, socket.request.session);
            if (result !== true) {
                socket.emit('message', result);
            }
        })

        // Deletes help ticket
        socket.on('deleteTicket', async (studentId) => {
            await deleteHelpTicket(studentId, socket.request.session);
        })
    }
}