const { logger } = require("../modules/logger")

module.exports = {
    run(socket, socketUpdates) {
        socket.on('getOwnedClasses', (email) => {
            logger.log('info', `[getOwnedClasses] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            logger.log('info', `[getOwnedClasses] email=(${email})`)

            socketUpdates.getOwnedClasses(email)
        })

        socket.on('logout', () => {
            try {
                logger.log('info', `[logout] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                socketUpdates.logout(socket)
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}