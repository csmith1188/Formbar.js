const { classInformation } = require("../modules/class/classroom")
const { logger } = require("../modules/logger")

module.exports = {
    run(socket, socketUpdates) {
        socket.on('pollUpdate', () => {
            logger.log('info', `[pollUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            socketUpdates.pollUpdate()
        })

        // Sends poll and student response data to client side virtual bar
        socket.on('vbUpdate', () => {
            logger.log('info', `[virtualBarUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            socketUpdates.virtualBarUpdate()
        })

        socket.on('customPollUpdate', () => {
            logger.log('info', `[customPollUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            socketUpdates.customPollUpdate(socket.request.session.email)
        })

        // Updates the control panel for the user and the rest of the class
        socket.on('cpUpdate', () => {
            logger.log('info', `[cpUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            // Get class id from the user's activeClass if session.classId is not set
            const email = socket.request.session.email;
            const user = email ? classInformation.users[email] : null;
            const classId = user && user.activeClass != null ? user.activeClass : socket.request.session.classId;
            const classroom = classId ? classInformation.classrooms[classId] : null;

            // Respond with the full classroom data so the page can populate
            if (classroom) {
                // socket.emit('cpUpdate', structuredClone(classroom));
            }

            // Send update to the rest of the class
            if (classId) {
                socketUpdates.classUpdate(classId);
                socketUpdates.controlPanelUpdate(classId);
            }
        })

        socket.on('classUpdate', () => {
            logger.log('info', `[classUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            socketUpdates.classUpdate()
        })

        socket.on('classBannedUsersUpdate', () => {
            socketUpdates.classBannedUsersUpdate()
        })
    }
}