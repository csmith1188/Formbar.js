const { classInformation } = require("../../modules/class/classroom")
const { database } = require("../../modules/database")
const { logger } = require("../../modules/logger")
const { userSockets } = require("../../modules/socketUpdates")
const { Student } = require("../../modules/student")
const { getUserClass } = require("../../modules/user")

module.exports = {
    order: 10,
    async run(socket, socketUpdates) {
        try {
            const { api } = socket.request.headers
            if (api) {
                await new Promise((resolve, reject) => {
                    database.get(
                        'SELECT * FROM users WHERE API=?',
                        [api],
                        async (err, userData) => {
                            try {
                                if (err) throw err
                                if (!userData) {
                                    logger.log('verbose', '[socket authentication] not a valid API Key')
                                    throw 'Not a valid API key'
                                }

                                if (!classInformation.users[userData.email]) {
                                    classInformation.users[userData.email] = new Student(
                                        userData.email,
                                        userData.id,
                                        userData.permissions,
                                        userData.API,
                                        null,
                                        null,
                                        userData.tags,
                                        userData.displayName,
                                        false
                                    )
                                }
                                socket.request.session.api = api
                                socket.request.session.userId = userData.id
                                socket.request.session.email = userData.email
                                socket.request.session.classId = getUserClass(userData.email);

                                socket.join(`api-${socket.request.session.api}`)
                                socket.join(`class-${socket.request.session.classId}`)
                                socket.emit('setClass', socket.request.session.classId)
                                socket.on('disconnect', () => {
                                    if (!userSockets[socket.request.session.email]) {
                                        socketUpdates.classKickUser(socket.request.session.email, socket.request.session.classId, false)
                                    }
                                })

                                resolve()
                            } catch (err) {
                                reject(err)
                            }
                        }
                    )
                }).catch((err) => {
                    if (err instanceof Error) {
                        throw err
                    }
                })
            } else if (socket.request.session.email) {
                socket.join(`class-${socket.request.session.classId}`)
                socket.join(`user-${socket.request.session.email}`)

                userSockets[socket.request.session.email] = socket
            }
        } catch (err) {
            logger.log('error', err.stack);
        }
    }
}