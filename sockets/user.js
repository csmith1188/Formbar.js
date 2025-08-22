const { logger } = require("../modules/logger")
const { deleteUser } = require("../modules/user");

module.exports = {
    run(socket, socketUpdates) {
        socket.on('getOwnedClasses', (email) => {
            logger.log('info', `[getOwnedClasses] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            logger.log('info', `[getOwnedClasses] email=(${email})`)

            socketUpdates.getOwnedClasses(email)
        })

        socket.on('deleteUser', async (userId) => {
            try {
                await deleteUser(userId, socket, socketUpdates);
            } catch (err) {
                logger.log('error', err.stack)
                socket.emit('message', 'There was a server error try again.')
            }
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