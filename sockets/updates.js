const { classInformation } = require("../modules/class/classroom")
const { logger } = require("../modules/logger")
const { managerUpdate } = require("../modules/socketUpdates")

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

        // Updates and stores poll history
        socket.on('cpUpdate', () => {
            logger.log('info', `[cpUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            socketUpdates.classPermissionUpdate();
        })

        socket.on('classBannedUsersUpdate', () => {
            socketUpdates.classBannedUsersUpdate()
        })

        socket.on('managerUpdate', () => {
            managerUpdate()
        })
    }
}