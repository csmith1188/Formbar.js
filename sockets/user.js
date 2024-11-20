const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { getUserClass } = require("../modules/user")
const { runQuery } = require("../modules/database")
const { userSockets, managerUpdate } = require("../modules/socketUpdates")

module.exports = {
    run(socket, socketUpdates) {
        socket.on('getOwnedClasses', (username) => {
            logger.log('info', `[getOwnedClasses] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            logger.log('info', `[getOwnedClasses] username=(${username})`)

            socketUpdates.getOwnedClasses(username)
        })

        // sends the class code of the class a user is in
        socket.on('getUserClass', ({ username, api }) => {
            try {
                logger.log('info', `[getUserClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[getUserClass] username=(${username}) api=(${api})`)

                if (api) {
                    database.get('SELECT * FROM users WHERE API=?', [api], (err, userData) => {
                        try {
                            if (err) throw err
                            if (!userData) {
                                socket.emit('getUserClass', { error: 'not a valid API Key' })
                                return
                            }

                            let classCode = getUserClass(userData.username)
                            if (classCode instanceof Error) throw classCode
                            
                            if (!classCode) {
                                socket.emit('getUserClass', { error: 'user is not logged in' })
                            } else if (classCode == 'noClass') {
                                socket.emit('getUserClass', { error: 'user is not in a class' })
                            } else {
                                socket.emit('getUserClass', className)
                            }
                        } catch (err) {
                            logger.log('error', err.stack)
                            socket.emit('getUserClass', { error: 'There was a server error try again.' })
                        }
                    })
                } else if (username) {
                    let classCode = getUserClass(username)

                    if (classCode instanceof Error) throw classCode

                    if (!classCode) socket.emit('getUserClass', { error: 'user is not logged in' })
                    else if (classCode == 'noClass') socket.emit('getUserClass', { error: 'user is not in a class' })
                    else socket.emit('getUserClass', className)
                } else socket.emit('getUserClass', { error: 'missing username or api key' })
            } catch (err) {
                logger.log('error', err.stack)
                socket.emit('getUserClass', { error: 'There was a server error try again.' })
            }
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
                    await runQuery('BEGIN TRANSACTION')

                    await Promise.all([
                        runQuery('DELETE FROM users WHERE id=?', userId),
                        runQuery('DELETE FROM classusers WHERE studentId=?', userId),
                        runQuery('DELETE FROM shared_polls WHERE userId=?', userId),
                    ])

                    await socketUpdates.deleteCustomPolls(userId)
                    await socketUpdates.deleteClassrooms(userId)

                    await runQuery('COMMIT')
                    await managerUpdate()
                    socket.emit('message', 'User deleted successfully')
                } catch (err) {
                    await runQuery('ROLLBACK')
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