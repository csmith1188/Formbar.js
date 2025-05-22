const { classInformation } = require("../modules/class/classroom")
const { database, dbRun } = require("../modules/database")
const { logger } = require("../modules/logger")
const { endPoll, clearPoll } = require("../modules/polls");

module.exports = {
    run(socket, socketUpdates) {
        socket.on('endPoll', async () => {
            try {
                await endPoll();
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('deletePoll', (pollId) => {
            try {
                let userId = socket.request.session.userId

                logger.log('info', `[deletePoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)}) pollId=(${pollId})`)
                logger.log('info', `[deletePoll] pollId=(${pollId})`)

                if (!pollId) {
                    socket.emit('message', 'No poll is selected.')
                    return
                }

                database.get('SELECT * FROM custom_polls WHERE id=?', pollId, async (err, poll) => {
                    try {
                        if (err) throw err

                        logger.log('info', `[deletePoll] poll=(${JSON.stringify(poll)})`)

                        if (userId != poll.owner) {
                            logger.log('info', '[deletePoll] not owner')
                            socket.emit('message', 'You do not have permission to delete this poll.')
                            return
                        }

                        await dbRun('BEGIN TRANSACTION')
                        await Promise.all([
                            dbRun('DELETE FROM custom_polls WHERE id=?', pollId),
                            dbRun('DELETE FROM shared_polls WHERE pollId=?', pollId),
                            dbRun('DELETE FROM class_polls WHERE pollId=?', pollId),
                        ]).catch(async (err) => {
                            await dbRun('ROLLBACK')
                            throw err
                        })

                        await dbRun('COMMIT')

                        for (let classroom of Object.values(classInformation)) {
                            let updatePolls = false

                            if (classroom.sharedPolls) {
                                if (classroom.sharedPolls.includes(pollId)) {
                                    classroom.sharedPolls.splice(classroom.sharedPolls.indexOf(pollId), 1)
                                    updatePolls = true
                                }
                            }

                            for (let user of Object.values(classroom.students)) {
                                if (user.sharedPolls.includes(pollId)) {
                                    user.sharedPolls.splice(user.sharedPolls.indexOf(pollId), 1)
                                    updatePolls = true
                                }

                                if (user.ownedPolls.includes(pollId)) {
                                    user.ownedPolls.splice(user.ownedPolls.indexOf(pollId), 1)
                                    updatePolls = true
                                }

                                if (updatePolls) {
                                    socketUpdates.customPollUpdate(user.email)
                                }
                            }
                        }

                        logger.log('info', '[deletePoll] deleted')
                        socket.emit('message', 'Poll deleted successfully!')
                    } catch (err) {
                        logger.log('error', err.stack);
                    }
                })
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        // End the current poll. Does not take any arguments
        socket.on('clearPoll', async () => {
            try {
                await clearPoll(socket);
            } catch (err) {
                logger.log('error', err.stack);
            }
        })
    }
}