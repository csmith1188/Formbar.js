const { classInformation } = require("../modules/class/classroom")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { userSockets } = require("../modules/socketUpdates")
const { createPoll } = require("../modules/polls");

module.exports = {
    run(socket, socketUpdates) {
        // Starts a poll with the data provided
        socket.on('startPoll', async (...args) => {
            try {
                const email = socket.request.session.email;
                const classId = classInformation.users[email].activeClass;

                // Support both passing a single object or multiple arguments for backward compatibility
                let pollData;
                if (args.length == 1) {
                    pollData = args[0];
                } else {
                    const [responseNumber, responseTextBox, pollPrompt, polls, blind, weight, tags, boxes, indeterminate, lastResponse, multiRes] = args;
                    pollData = {
                        prompt: pollPrompt,
                        answers: Array.isArray(polls) ? polls : [],
                        blind: !!blind,
                        weight: Number(weight ?? 1),
                        tags: Array.isArray(tags) ? tags : [],
                        studentsAllowedToVote: Array.isArray(boxes) ? boxes : undefined,
                        indeterminate: Array.isArray(indeterminate) ? indeterminate : [],
                        allowTextResponses: !!responseTextBox,
                        allowMultipleResponses: !!multiRes,
                    }
                }

                await createPoll(classId, {
                    prompt: pollData.prompt,
                    answers: Array.isArray(pollData.answers) ? pollData.answers : [],
                    blind: !!pollData.blind,
                    weight: Number(pollData.weight ?? 1),
                    tags: Array.isArray(pollData.tags) ? pollData.tags : [],
                    studentsAllowedToVote: Array.isArray(pollData.studentsAllowedToVote) ? pollData.studentsAllowedToVote : [],
                    indeterminate: Array.isArray(pollData.indeterminate) ? pollData.indeterminate : [],
                    allowTextResponses: !!pollData.allowTextResponses,
                    allowMultipleResponses: !!pollData.allowMultipleResponses,
                    lastResponse: pollData.lastResponse || false
                }, socket.request.session);
                socket.emit('startPoll');
            } catch (err) {
                logger.log("error", err.stack);
            }
        })

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

                                classInformation.classrooms[socket.request.session.classId].students[socket.request.session.email].ownedPolls.push(nextPollId)
                                socket.emit('message', 'Poll saved successfully!')
                                socketUpdates.customPollUpdate(socket.request.session.email)
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

        socket.on('savePoll', (poll, pollId) => {
            try {
                logger.log('info', `[savePoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[savePoll] poll=(${JSON.stringify(poll)}) id=(${pollId})`)

                const userId = socket.request.session.userId
                if (pollId) {
                    database.get('SELECT * FROM custom_polls WHERE id=?', [pollId], (err, poll) => {
                        try {
                            if (err) throw err

                            if (userId != poll.owner) {
                                socket.emit('message', 'You do not have permission to edit this poll.')
                                return
                            }

                            database.run('UPDATE custom_polls SET name=?, prompt=?, answers=?, textRes=?, blind=?, weight=?, public=? WHERE id=?', [
                                poll.name,
                                poll.prompt,
                                JSON.stringify(poll.answers),
                                poll.textRes,
                                poll.blind,
                                poll.weight,
                                poll.public,
                                pollId
                            ], (err) => {
                                try {
                                    if (err) throw err

                                    socket.emit('message', 'Poll saved successfully!')
                                    socketUpdates.customPollUpdate(socket.request.session.email)
                                } catch (err) {
                                    logger.log('error', err.stack);
                                }
                            })
                        } catch (err) {
                            logger.log('error', err.stack);
                        }
                    })
                } else {
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

                                    classInformation.classrooms[socket.request.session.classId].students[socket.request.session.email].ownedPolls.push(nextPollId)
                                    socket.emit('message', 'Poll saved successfully!')
                                    socketUpdates.customPollUpdate(socket.request.session.email)
                                } catch (err) {
                                    logger.log('error', err.stack);
                                }
                            })
                        } catch (err) {
                            logger.log('error', err.stack);
                        }
                    })
                }
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('setPublicPoll', (pollId, value) => {
            try {
                logger.log('info', `[setPublicPoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[setPublicPoll] pollId=(${pollId}) value=(${value})`)

                database.run('UPDATE custom_polls set public=? WHERE id=?', [value, pollId], (err) => {
                    try {
                        if (err) throw err

                        for (const userSocket of Object.values(userSockets)) {
                            socketUpdates.customPollUpdate(userSocket.request.session.email)
                        }
                    } catch (err) {
                        logger.log('error', err.stack);
                    }
                })
            } catch (err) {
                logger.log('error', err.stack);
            }
        })
    }
}