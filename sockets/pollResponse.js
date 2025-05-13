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
                const email = socket.request.session.email
                const classroom = classInformation.classrooms[classId]
                // Check if user is allowed to respond
                const isRemoving = res === 'remove' || (classroom.poll.multiRes && Array.isArray(res) && res.length === 0);
                if (!classroom.poll.studentBoxes.includes(email) && !isRemoving) {
                    return; // If the user is not included in the poll, do not allow them to respond
                }

                // Check if the response provided is a valid response
                if (!classroom.poll.multiRes) {
                    // For normal polls, response must be either 'remove' or a valid response key
                    if (res !== 'remove' && !Object.keys(classroom.poll.responses).includes(res)) {
                        return;
                    }
                } else {
                    // For multires polls, validate that all responses are valid
                    if (isRemoving) {
                        // Allow removal
                    } else if (!Array.isArray(res)) {
                        return; // Must be an array for multires polls
                    } else {
                        // Check that all responses in the array are valid
                        const validResponses = Object.keys(classroom.poll.responses);
                        const allValid = res.every(response => validResponses.includes(response));
                        if (!allValid) {
                            return;
                        }
                    }
                }

                // If the users response is different from the previous response, play a sound
                const prevRes = classroom.students[email].pollRes.buttonRes;
                const hasChanged = classroom.poll.multiRes ? 
                    JSON.stringify(prevRes) !== JSON.stringify(res) : 
                    prevRes !== res;
                
                if (hasChanged || classroom.students[email].pollRes.textRes !== textRes) {
                    if (isRemoving) {
                        advancedEmitToClass('removePollSound', classId, { api: true })
                    } else {
                        advancedEmitToClass('pollSound', classId, { api: true })
                    }
                }
                
                // Handle response storage
                if (isRemoving) {
                    classroom.students[email].pollRes.buttonRes = classroom.poll.multiRes ? [] : "";
                    classroom.students[email].pollRes.textRes = "";
                } else {
                    classroom.students[email].pollRes.buttonRes = res;
                    classroom.students[email].pollRes.textRes = textRes;
                }
                classroom.students[email].pollRes.time = new Date()

                // Digipog calculations
                if (!isRemoving && earnedDigipogs[email] === undefined) {
                    let amount = 0;
                    if (classroom.poll.multiRes) {
                        amount = res.length;
                    } else {
                        // For normal polls, count based on text response length
                        for (let i = 0; i <= resLength; i++) {
                            amount++;
                        }
                    }

                    amount = Math.ceil(amount/4);
                    amount = amount > 5 ? 5 : amount;
                    if (Number.isInteger(amount)) {
                        database.run(`UPDATE users SET digipogs = digipogs + ${amount} WHERE email = '${email}'`, (err) => {
                            if (err) {
                                console.log(`Error adding ${amount} digipogs to ${email}`);
                                console.error(err);
                            }
                        });
                        earnedDigipogs[email] = email;
                    }
                }
                logger.log('verbose', `[pollResp] user=(${classroom.students[socket.request.session.email]})`)

                socketUpdates.classPermissionUpdate()
                socketUpdates.virtualBarUpdate()
            } catch (err) {
                logger.log('error', err.stack);
            }
        })
    }
}