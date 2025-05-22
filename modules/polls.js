const { classInformation } = require("./class/classroom");
const { logger } = require("./logger");
const { generateColors } = require("./util");
const { currentPoll, advancedEmitToClass } = require("./socketUpdates");
const { database } = require("./database");
const { userSocketUpdates } = require("../sockets/init");

// Stores an object containing the earned Digipogs
// This is only stored in an object because Javascript passes objects as references
const earnedObject = {
    earnedDigipogs: []
};

/**
 * Creates a new poll in the class.
 * @param pollData
 * @param socket
 */
async function createPoll(pollData, socket) {
    try {
        const { resNumber, resTextBox, pollPrompt, polls, blind, weight, tags, boxes, indeterminate, multiRes } = pollData;
        const socketUpdates = userSocketUpdates[socket.request.session.email];
        earnedObject.earnedDigipogs = [];

        // Get class id and check if the class is active before continuing
        const classId = socket.request.session.classId;
        if (!classInformation.classrooms[classId] || !classInformation.classrooms[classId].isActive) {
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

        // Set the poll's data in the classroom
        classInformation.classrooms[classId].poll.weight = weight
        classInformation.classrooms[classId].poll.textRes = resTextBox
        classInformation.classrooms[classId].poll.prompt = pollPrompt
        classInformation.classrooms[classId].poll.multiRes = multiRes
        for (const key in classInformation.classrooms[socket.request.session.classId].students) {
            classInformation.classrooms[classId].students[key].pollRes.buttonRes = ''
            classInformation.classrooms[classId].students[key].pollRes.textRes = ''
        }

        // Log data about the class then call the appropriate update functions
        logger.log('verbose', `[startPoll] classData=(${JSON.stringify(classInformation.classrooms[classId])})`)
        socketUpdates.pollUpdate()
        socketUpdates.virtualBarUpdate()
        socketUpdates.classPermissionUpdate()

        // If the request is originating from the http API, then send a response specifically for it
        // Otherwise, simply emit the startPoll event
        if (socket.isEmulatedSocket) {
            socket.res.status(200).json({ message: 'Success' });
        } else {
            socket.emit('startPoll')
        }
    } catch (err) {
        logger.log('error', err.stack);
    }
}

/**
 * Ends the current poll in the class.
 * @param socket
 */
async function endPoll(socket) {
    const socketUpdates = userSocketUpdates[socket.request.session.email];

    await socketUpdates.endPoll();
    socketUpdates.pollUpdate();
    socketUpdates.classPermissionUpdate();

    if (socket.isEmulatedSocket) {
        socket.res.status(200).json({ message: 'Success' });
    }
}

/**
 * Clears the current poll from the class
 * @param socket
 */
async function clearPoll(socket) {
    const socketUpdates = userSocketUpdates[socket.request.session.email];
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
    if (socket.isEmulatedSocket) {
        socket.res.status(200).json({ message: 'Success' });
    }
}

function pollResponse(res, textRes, socket) {
    const resLength = textRes != null ? textRes.length : 0;
    logger.log('info', `[pollResp] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
    logger.log('info', `[pollResp] res=(${res}) textRes=(${textRes}) resLength=(${resLength})`)

    const classId = socket.request.session.classId
    const email = socket.request.session.email
    const classroom = classInformation.classrooms[classId]
    const socketUpdates = userSocketUpdates[socket.request.session.email];

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
        // For multi-res polls, validate that all responses are valid
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
            advancedEmitToClass('removePollSound', classId, {})
        } else {
            advancedEmitToClass('pollSound', classId, {})
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
    if (!isRemoving && earnedObject.earnedDigipogs[email] === undefined) {
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
            earnedObject.earnedDigipogs[email] = email;
        }
    }
    logger.log('verbose', `[pollResp] user=(${classroom.students[socket.request.session.email]})`)

    socketUpdates.classPermissionUpdate()
    socketUpdates.virtualBarUpdate()
}

/**
 * Function to get the poll responses in a class.
 * @param {Object} classData - The data of the class.
 * @returns {Object} An object containing the poll responses.
 */
function getPollResponses(classData) {
    // Create an empty object to store the poll responses
    let tempPolls = {}

    // If the poll is not active, return an empty object
    if (!classData.poll.status) return {}

    // If there are no responses to the poll, return an empty object
    if (Object.keys(classData.poll.responses).length == 0) return {}

    // For each response in the poll responses
    for (let [resKey, resValue] of Object.entries(classData.poll.responses)) {
        // Add the response to the tempPolls object and initialize the count of responses to 0
        tempPolls[resKey] = {
            ...resValue,
            responses: 0
        }
    }

    // For each student in the class
    for (let student of Object.values(classData.students)) {
        // If the student exists and has responded to the poll
        if (student && Object.keys(tempPolls).includes(student.pollRes.buttonRes)) {
            // Increment the count of responses for the student's response
            tempPolls[student.pollRes.buttonRes].responses++
        }
    }

    // Return the tempPolls object
    return tempPolls
}

module.exports = {
    createPoll,
    endPoll,
    clearPoll,
    pollResponse,
    getPollResponses,
    earnedObject
}