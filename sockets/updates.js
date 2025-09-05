const { classInformation } = require("../modules/class")
const { logger } = require("../modules/logger")
const { managerUpdate } = require("../modules/socketUpdates")

module.exports = {
    run(socket, socketUpdates) {
        socket.on('pollUpdate', () => {
            logger.log('info', `[pollUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            socketUpdates.pollUpdate()
        })

        socket.on('modeUpdate', () => {
            logger.log('info', `[modeUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            socketUpdates.modeUpdate()
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

        socket.on('pluginUpdate', () => {
            logger.log('info', `[pluginUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            socketUpdates.pluginUpdate()
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

        // Changes the class mode
        socket.on('modeChange', (mode) => {
            try {
                logger.log('info', `[modeChange] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[modeChange] mode=(${mode})`)

                classInformation.classrooms[socket.request.session.classId].mode = mode

                logger.log('verbose', `[modeChange] classData=(${classInformation.classrooms[socket.request.session.classId]})`)

                socketUpdates.modeUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}