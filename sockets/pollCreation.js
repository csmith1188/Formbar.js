const { classInformation } = require("../modules/class")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { userSockets } = require("../modules/socketUpdates")
const { generateColors } = require("../modules/util")

module.exports = {
    run(socket, socketUpdates) {
        // Starts a new poll. Takes the number of responses and whether or not their are text responses
        socket.on('startPoll', async (resNumber, resTextBox, pollPrompt, polls, blind, weight, tags, boxes, indeterminate, lastResponse, multiRes) => {
            try {
                logger.log('info', `[startPoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[startPoll] resNumber=(${resNumber}) resTextBox=(${resTextBox}) pollPrompt=(${pollPrompt}) polls=(${JSON.stringify(polls)}) blind=(${blind}) weight=(${weight}) tags=(${tags})`)

                await socketUpdates.clearPoll()
                let generatedColors = generateColors(resNumber)
                logger.log('verbose', `[pollResp] user=(${classInformation[socket.request.session.class].students[socket.request.session.username]})`)
                if (generatedColors instanceof Error) throw generatedColors

                classInformation.classrooms[socket.request.session.classId].mode = 'poll'
                classInformation.classrooms[socket.request.session.classId].poll.blind = blind
                classInformation.classrooms[socket.request.session.classId].poll.status = true
                
                if (tags) {
                    classInformation.classrooms[socket.request.session.classId].poll.requiredTags = tags
                } else {
                    classInformation.classrooms[socket.request.session.classId].poll.requiredTags = []
                }

                if (boxes) {
                    classInformation.classrooms[socket.request.session.classId].poll.studentBoxes = boxes
                } else {
                    classInformation.classrooms[socket.request.session.classId].poll.studentBoxes = []
                }

                if (indeterminate) {
                    classInformation.classrooms[socket.request.session.classId].poll.studentIndeterminate = indeterminate
                } else {
                    classInformation.classrooms[socket.request.session.classId].poll.studentIndeterminate = []
                }

                if (lastResponse) {
                    classInformation.classrooms[socket.request.session.classId].poll.lastResponse = lastResponse
                } else {
                    classInformation.classrooms[socket.request.session.classId].poll.lastResponse = []
                }

                // Creates an object for every answer possible the teacher is allowing
                for (let i = 0; i < resNumber; i++) {
                    let letterString = 'abcdefghijklmnopqrstuvwxyz'
                    let answer = letterString[i]
                    let weight = 1
                    let color = generatedColors[i]

                    if (polls[i].answer)
                        answer = polls[i].answer
                    if (polls[i].weight)
                        weight = polls[i].weight
                    if (polls[i].color)
                        color = polls[i].color

                    classInformation[socket.request.session.class].poll.responses[answer] = {
                        answer: answer,
                        weight: weight,
                        color: color
                    }
                }

                classInformation.classrooms[socket.request.session.classId].poll.weight = weight
                classInformation.classrooms[socket.request.session.classId].poll.textRes = resTextBox
                classInformation.classrooms[socket.request.session.classId].poll.prompt = pollPrompt
                classInformation.classrooms[socket.request.session.classId].poll.multiRes = multiRes

                // @TODO: come back to this
                for (const key in classInformation[socket.request.session.class].students) {
                    classInformation[socket.request.session.class].students[key].pollRes.buttonRes = ''
                    classInformation[socket.request.session.class].students[key].pollRes.textRes = ''
                }

                logger.log('verbose', `[startPoll] classData=(${JSON.stringify(classInformation[socket.request.session.class])})`)

                socketUpdates.pollUpdate()
                socketUpdates.virtualBarUpdate()
                socketUpdates.classPermissionUpdate()
                socket.emit('startPoll')
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('savePoll', (poll, id) => {
            try {
                logger.log('info', `[savePoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[savePoll] poll=(${JSON.stringify(poll)}) id=(${id})`)

                let userId = socket.request.session.userId

                if (id) {
                    database.get('SELECT * FROM custom_polls WHERE id=?', [id], (err, poll) => {
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
                                id
                            ], (err) => {
                                try {
                                    if (err) throw err

                                    socket.emit('message', 'Poll saved successfully!')
                                    socketUpdates.customPollUpdate(socket.request.session.username)
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

                                    classInformation[socket.request.session.class].students[socket.request.session.username].ownedPolls.push(nextPollId)
                                    socket.emit('message', 'Poll saved successfully!')
                                    socketUpdates.customPollUpdate(socket.request.session.username)
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

                        for (let userSocket of Object.values(userSockets)) {
                            socketUpdates.customPollUpdate(userSocket.request.session.username)
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