const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { dbRun } = require("../modules/database")
const { userSockets, managerUpdate } = require("../modules/socketUpdates")

module.exports = {
    run(socket, socketUpdates) {
        socket.on('getOwnedClasses', (username) => {
            logger.log('info', `[getOwnedClasses] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            logger.log('info', `[getOwnedClasses] username=(${username})`)

            socketUpdates.getOwnedClasses(username)
        })

        socket.on('deleteUser', async (userId) => {
            try {
                logger.log('info', `[deleteUser] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[deleteUser] userId=(${userId})`)

                const user = await new Promise((resolve, reject) => {
                    database.get('SELECT * FROM users WHERE id=?', userId, (err, user) => {
                        if (err) reject(err)
                        resolve(user)
                    })
                })
                if (!user) {
                    socket.emit('message', 'User not found')
                    return
                }

                if (userSockets[user.username]) {
                    socketUpdates.logout(userSockets[user.username])
                }

                try {
                    await dbRun('BEGIN TRANSACTION')

                    await Promise.all([
                        dbRun('DELETE FROM users WHERE id=?', userId),
                        dbRun('DELETE FROM classusers WHERE studentId=?', userId),
                        dbRun('DELETE FROM shared_polls WHERE userId=?', userId),
                    ])

                    await socketUpdates.deleteCustomPolls(userId)
                    await socketUpdates.deleteClassrooms(userId)

                    await dbRun('COMMIT')
                    await managerUpdate()
                    socket.emit('message', 'User deleted successfully')
                } catch (err) {
                    await dbRun('ROLLBACK')
                    throw err
                }
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