const { classInformation } = require("../modules/class")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { userSockets } = require("../modules/socketUpdates")
const { generateColors } = require("../modules/util")

let earnedObject = {
    earnedDigipogs: []
};

module.exports = {
    run(socket, socketUpdates) {
        // Starts a new poll. Takes the number of responses and whether or not their are text responses
        socket.on('startPoll', async (resNumber, resTextBox, pollPrompt, polls, blind, weight, tags, boxes, indeterminate, multiRes) => {
            try {
                earnedObject.earnedDigipogs = [];
                // Get class id and check if the class is active before continuing
                const classId = socket.request.session.classId;
                if (!classInformation.classrooms[classId].isActive) {
                    socket.emit('message', 'This class is not currently active.');
                    return;
                }

                // Log poll information
                logger.log('info', `[startPoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[startPoll] resNumber=(${resNumber}) resTextBox=(${resTextBox}) pollPrompt=(${pollPrompt}) polls=(${JSON.stringify(polls)}) blind=(${blind}) weight=(${weight}) tags=(${tags})`)

                await socketUpdates.clearPoll()
                let generatedColors = generateColors(resNumber)
                logger.log('verbose', `[pollResp] user=(${classInformation.classrooms[socket.request.session.classId].students[socket.request.session.email]})`)
                if (generatedColors instanceof Error) throw generatedColors

                classInformation.classrooms[classId].mode = 'poll'
                classInformation.classrooms[classId].poll.blind = blind
                classInformation.classrooms[classId].poll.status = true
                
                if (tags) {
                    classInformation.classrooms[classId].poll.requiredTags = tags
                } else {
                    classInformation.classrooms[classId].poll.requiredTags = []
                }

                if (boxes) {
                    classInformation.classrooms[classId].poll.studentBoxes = boxes
                } else {
                    classInformation.classrooms[classId].poll.studentBoxes = Object.keys(classInformation.classrooms[classId].students)
                }

                if (indeterminate) {
                    classInformation.classrooms[classId].poll.studentIndeterminate = indeterminate
                } else {
                    classInformation.classrooms[classId].poll.studentIndeterminate = []
                }

                // Creates an object for every answer possible the teacher is allowing
                const letterString = 'abcdefghijklmnopqrstuvwxyz'
                for (let i = 0; i < resNumber; i++) {
                    let answer = letterString[i]
                    let weight = 1
                    let color = generatedColors[i]

                    if (polls[i].answer)
                        answer = polls[i].answer
                    if (polls[i].weight)
                        weight = polls[i].weight
                    if (polls[i].color)
                        color = polls[i].color

                    classInformation.classrooms[classId].poll.responses[answer] = {
                        answer: answer,
                        weight: weight,
                        color: color
                    }
                }

                classInformation.classrooms[classId].poll.weight = weight
                classInformation.classrooms[classId].poll.textRes = resTextBox
                classInformation.classrooms[classId].poll.prompt = pollPrompt
                classInformation.classrooms[classId].poll.multiRes = multiRes

                for (const key in classInformation.classrooms[socket.request.session.classId].students) {
                    classInformation.classrooms[classId].students[key].pollRes.buttonRes = ''
                    classInformation.classrooms[classId].students[key].pollRes.textRes = ''
                }

                logger.log('verbose', `[startPoll] classData=(${JSON.stringify(classInformation.classrooms[classId])})`)

                socketUpdates.pollUpdate()
                socketUpdates.virtualBarUpdate()
                socketUpdates.classPermissionUpdate()
                socket.emit('startPoll')
            } catch (err) {
                logger.log('error', err.stack);
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

                        for (let userSocket of Object.values(userSockets)) {
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
    },
    earnedObject
}