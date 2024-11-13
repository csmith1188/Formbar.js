const { classInformation } = require("../modules/class")
const { logger } = require("../modules/logger")
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

                classInformation[socket.request.session.class].mode = 'poll'
                classInformation[socket.request.session.class].poll.blind = blind
                classInformation[socket.request.session.class].poll.status = true
                
                if (tags) {
                    classInformation[socket.request.session.class].poll.requiredTags = tags
                } else {
                    classInformation[socket.request.session.class].poll.requiredTags = []
                }

                if (boxes) {
                    classInformation[socket.request.session.class].poll.studentBoxes = boxes
                } else {
                    classInformation[socket.request.session.class].poll.studentBoxes = []
                }

                if (indeterminate) {
                    classInformation[socket.request.session.class].poll.studentIndeterminate = indeterminate
                } else {
                    classInformation[socket.request.session.class].poll.studentIndeterminate = []
                }

                if (lastResponse) {
                    classInformation[socket.request.session.class].poll.lastResponse = lastResponse
                } else {
                    classInformation[socket.request.session.class].poll.lastResponse = []
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

                classInformation[socket.request.session.class].poll.weight = weight
                classInformation[socket.request.session.class].poll.textRes = resTextBox
                classInformation[socket.request.session.class].poll.prompt = pollPrompt
                classInformation[socket.request.session.class].poll.multiRes = multiRes

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
    }
}