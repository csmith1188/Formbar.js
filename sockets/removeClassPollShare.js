const { isLoggedIn } = require("../modules/authentication")
const { classInformation } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { customPollUpdate, getPollShareIds } = require("../modules/socketUpdates")

module.exports = {
    run(socket) {
        socket.on('removeClassPollShare', (pollId, classId) => {
            try {
                logger.log('info', `[removeClassPollShare] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[removeClassPollShare] pollId=(${pollId}) classId=(${classId})`)

                database.get(
                    'SELECT * FROM class_polls WHERE pollId=? AND classId=?',
                    [pollId, classId],
                    (err, pollShare) => {
                        try {
                            if (err) throw err

                            if (!pollShare) {
                                socket.emit('message', 'Poll is not shared to this class')
                                return
                            }

                            database.run(
                                'DELETE FROM class_polls WHERE pollId=? AND classId=?',
                                [pollId, classId],
                                (err) => {
                                    try {
                                        if (err) throw err

                                        socket.emit('message', 'Successfully unshared class')
                                        getPollShareIds(pollId)

                                        database.get('SELECT * FROM classroom WHERE id=?', classId, async (err, classroom) => {
                                            try {
                                                if (err) throw err

                                                if (!classroom) {
                                                    logger.log('critical', 'Classroom does not exist')
                                                    return
                                                }
                                                if (!classInformation[classroom.key]) return

                                                let sharedPolls = classInformation[classroom.key].sharedPolls
                                                sharedPolls.splice(sharedPolls.indexOf(pollId), 1)
                                                for (let username of Object.keys(classInformation[classroom.key].students)) {
                                                    customPollUpdate(username)
                                                }
                                            } catch (err) {
                                                logger.log('error', err.stack);
                                            }
                                        })
                                    } catch (err) {
                                        logger.log('error', err.stack)
                                    }
                                }
                            )
                        } catch (err) {
                            logger.log('error', err.stack)
                        }
                    }
                )
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}