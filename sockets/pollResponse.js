const { classInformation } = require("../modules/class")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { advancedEmitToClass, userSockets} = require("../modules/socketUpdates")
const { earnedObject } = require('./pollCreation');

let earnedDigipogs = earnedObject.earnedDigipogs;

module.exports = {
    run(socket, socketUpdates) {
        // /poll websockets for updating the database
        socket.on('pollResp', (res, textRes) => {
            try {
                const resLength = textRes != null ? textRes.length : 0;
                logger.log('info', `[pollResp] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[pollResp] res=(${res}) textRes=(${textRes}) resLength=(${resLength})`)
                
                const classId = socket.request.session.classId
                const username = socket.request.session.username
                const classroom = classInformation.classrooms[classId]
                if (!classroom.poll.studentBoxes.includes(username) && res != 'remove' && res != []) {
                    return; // If the user is not included in the poll, do not allow them to respond
                }

                // Check if the response provided is a valid response
                if (!classroom.poll.multiRes) {
                    if (!Object.keys(classroom.poll.responses).includes(res) && res != 'remove') {
                        return;
                    }
                } else {
                    for (const response of res) {
                        if (!Object.keys(classroom.poll.responses).includes(response)) {
                            return;
                        }
                    }
                }

                // If the users response is different from the previous response, play a sound
                // If the user is removing their response, play a different sound
                if (classroom.students[username].pollRes.buttonRes != res || classroom.students[username].pollRes.textRes != textRes) {
                    if (res == 'remove') {
                        advancedEmitToClass('removePollSound', classId, { api: true })
                    } else {
                        advancedEmitToClass('pollSound', classId, { api: true })
                    }
                }
                
                // If the users response is to remove their response, set the response to an empty string
                // Also, set the time of the response to the current time
                classroom.students[username].pollRes.buttonRes = res == "remove" ? "" : res
                classroom.students[username].pollRes.textRes = res == "remove" ? "" : textRes
                classroom.students[username].pollRes.time = new Date()

                // Digipog calculations
                if (textRes !== 'remove' && earnedDigipogs[username] === undefined) {
                    let amount = 0;
                    for (let i = 0; i <= resLength; i++) {
                        amount++;
                    }

                    amount = Math.ceil(amount/4);
                    amount = amount > 5 ? 5 : amount;
                    if (Number.isInteger(amount)) {
                        database.run(`UPDATE users SET digipogs = digipogs + ${amount} WHERE username = '${username}'`, (err) => {
                            if (err) {
                                console.log(`Error adding ${amount} digipogs to ${username}`);
                                console.error(err);
                            }
                        });
                        earnedDigipogs[username] = username;
                    }
                }
                logger.log('verbose', `[pollResp] user=(${classroom.students[socket.request.session.username]})`)

                socketUpdates.classPermissionUpdate()
                socketUpdates.virtualBarUpdate()
            } catch (err) {
                logger.log('error', err.stack);
            }
        })
    }
}