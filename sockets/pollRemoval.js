const { classInformation } = require("../modules/class")
const { database, runQuery } = require("../modules/database")
const { logger } = require("../modules/logger")

module.exports = {
    run(socket, socketUpdates) {
        socket.on("classPoll", (poll) => {
            try {
                let userId = socket.request.session.userId
                database.get('SELECT seq AS nextPollId from sqlite_sequence WHERE name = "custom_polls"', (err, nextPollId) => {
                    try {
                        if (err) throw err
                        if (!nextPollId) logger.log('critical', '[savePoll] nextPollId not found')

                        nextPollId = nextPollId.nextPollId + 1

                        database.run('INSERT INTO custom_polls (owner, name, prompt, answers, textRes, blind, weight, public) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
                            userId,
                            poll.name,
                            poll.prompt,
                            JSON.stringify(poll.answers),
                            poll.textRes,
                            poll.blind,
                            poll.weight,
                            poll.public
                        ], (err) => {
                            try {
                                if (err) throw err

                                classInformation.classrooms[socket.request.session.classId].students[socket.request.session.username].ownedPolls.push(nextPollId)
                                socket.emit('message', 'Poll saved successfully!')
                                socketUpdates.customPollUpdate(socket.request.session.username)
                                socket.emit("classPollSave", nextPollId);
                            } catch (err) {
                                logger.log('error', err.stack);
                            }
                        })
                    } catch (err) {
                        logger.log('error', err.stack);
                    }
                })
            } catch (err) {
                logger.log("error", err.stack);
            }
        })
        
        socket.on('endPoll', async () => {
            try {
                await socketUpdates.endPoll();
                socketUpdates.pollUpdate();
                socketUpdates.classPermissionUpdate();
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

                        await runQuery('BEGIN TRANSACTION')

                        await Promise.all([
                            runQuery('DELETE FROM custom_polls WHERE id=?', pollId),
                            runQuery('DELETE FROM shared_polls WHERE pollId=?', pollId),
                            runQuery('DELETE FROM class_polls WHERE pollId=?', pollId),
                        ]).catch(async (err) => {
                            await runQuery('ROLLBACK')
                            throw err
                        })

                        await runQuery('COMMIT')

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
                                    socketUpdates.customPollUpdate(user.username)
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
                await socketUpdates.clearPoll();
                
                // Adds data to the previous poll answers table upon clearing the poll
                for (const student of Object.values(classInformation.classrooms[socket.request.session.classId].students)) {
                    if (student.classPermissions != 5) {
                        const currentPollId = classInformation.classrooms[socket.request.session.classId].pollHistory[currentPoll].id
                        for (let i = 0; i < student.pollRes.buttonRes.length; i++) {
                            const studentRes = student.pollRes.buttonRes[i]
                            const studentId = student.id
                            database.run('INSERT INTO poll_answers(pollId, userId, buttonResponse) VALUES(?, ?, ?)', [currentPollId, studentId, studentRes], (err) => {
                                if (err) {
                                    logger.log('error', err.stack)
                                }
                            })
                        }

                        const studentTextRes = student.pollRes.textRes
                        const studentId = student.id
                        database.run('INSERT INTO poll_answers(pollId, userId, textResponse) VALUES(?, ?, ?)', [currentPollId, studentId, studentTextRes], (err) => {
                            if (err) {
                                logger.log('error', err.stack)
                            }
                        })
                    }
                }

                socketUpdates.pollUpdate();
                socketUpdates.virtualBarUpdate();
                socketUpdates.classPermissionUpdate();
            } catch (err) {
                logger.log('error', err.stack);
            }
        })
    }
}