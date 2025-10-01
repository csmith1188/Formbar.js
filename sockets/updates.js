const { logger } = require("../modules/logger")

module.exports = {
    run(socket, socketUpdates) {
        socket.on('classUpdate', () => {
            logger.log('info', `[classUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            socketUpdates.classUpdate(socket.request.session.classId, { global: false } )
        });

        socket.on('customPollUpdate', () => {
            logger.log('info', `[customPollUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            socketUpdates.customPollUpdate(socket.request.session.email)
        });

        socket.on('classBannedUsersUpdate', () => {
            socketUpdates.classBannedUsersUpdate()
        });
    }
}