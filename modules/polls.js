const { classInformation } = require("./class/classroom");
const { logger } = require("./logger");
const { generateColors } = require("./util");
const { advancedEmitToClass } = require("./socketUpdates");
const { database, dbGetAll, dbRun } = require("./database");
const { userSocketUpdates } = require("../sockets/init");
const { MANAGER_PERMISSIONS } = require("./permissions");

// Stores an object containing the pog meter increases for users in a poll
// This is only stored in an object because Javascript passes objects as references
const pogMeterTracker = {
    pogMeterIncreased: []
};

/**
 * Creates a new poll in the class.
 * @param {number} classId - The ID of the class.
 * @param {Object} pollData - The data for the poll.
 * @param {Object} userSession - The user session object.
 */
async function createPoll(classId, pollData, userSession) {
    try {
        const { prompt, answers, blind, tags, studentsAllowedToVote, allowVoteChanges, indeterminate, allowTextResponses, allowMultipleResponses } = pollData;
        let { weight } = pollData;
        const numberOfResponses = Object.keys(answers).length;
        const socketUpdates = userSocketUpdates[userSession.email];
        pogMeterTracker.pogMeterIncreased = [];

        // Ensure weight is a number and limit it to a maximum of 5 and a minimum of above 0
        weight = Math.floor((weight || 1) * 100) / 100; // Round to 2 decimal places
        if (!weight || isNaN(weight) || weight <= 0) weight = 1;
        weight = weight > 5 ? 5 : weight;

        // Get class id and check if the class is active before continuing
        const classId = userSession.classId;
        if (!classInformation.classrooms[classId] || !classInformation.classrooms[classId].isActive) {
            return 'This class is not currently active.';
        }

        // Log poll information
        logger.log('info', `[startPoll] session=(${JSON.stringify(userSession)})`)
        logger.log('info', `[startPoll] allowTextResponses=(${allowTextResponses}) prompt=(${prompt}) answers=(${JSON.stringify(answers)}) blind=(${blind}) weight=(${weight}) tags=(${tags})`)

        await clearPoll(classId, userSession, false)
        let generatedColors = generateColors(Object.keys(answers).length)
        logger.log('verbose', `[pollResp] user=(${classInformation.classrooms[classId].students[userSession.email]})`)
        if (generatedColors instanceof Error) throw generatedColors

        classInformation.classrooms[classId].poll.allowVoteChanges = allowVoteChanges;
        classInformation.classrooms[classId].poll.blind = blind
        classInformation.classrooms[classId].poll.status = true

        if (tags) {
            classInformation.classrooms[classId].poll.requiredTags = tags
        } else {
            classInformation.classrooms[classId].poll.requiredTags = []
        }

        if (studentsAllowedToVote) {
            classInformation.classrooms[classId].poll.studentsAllowedToVote = studentsAllowedToVote
        } else {
            classInformation.classrooms[classId].poll.studentsAllowedToVote = [];
            for (const student of classInformation.classrooms[classId].students) {
                // If the student has been excluded by permission, is on break, is offline, or has been manually excluded, do not allow them to vote
                if (classInformation.classrooms[classId].excludedPermissions.includes(student.classPermissions) || student.break || student.tags.includes('Offline') || student.tags.includes('Excluded')) { 
                    continue;
                }
                classInformation.classrooms[classId].poll.studentsAllowedToVote.push(student.id.toString());
            }
        }

        // Creates an object for every answer possible the teacher is allowing
        const letterString = 'abcdefghijklmnopqrstuvwxyz'
        for (let i = 0; i < numberOfResponses; i++) {
            let answer = letterString[i]
            let weight = 1
            let color = generatedColors[i]

            if (answers[i].answer) {
                answer = answers[i].answer
            }

            if (answers[i].weight) {
                if (isNaN(answers[i].weight) || answers[i].weight <= 0) weight = 1
                weight = Math.floor(answers[i].weight * 100) / 100
                weight = weight > 5 ? 5 : weight
            }

            if (answers[i].color) {
                color = answers[i].color
            }

            classInformation.classrooms[classId].poll.responses[answer] = {
                answer: answer,
                weight: weight,
                color: color
            }
        }

        // Set the poll's data in the classroom
        classInformation.classrooms[classId].poll.weight = weight
        classInformation.classrooms[classId].poll.allowTextResponses = allowTextResponses
        classInformation.classrooms[classId].poll.prompt = prompt
        classInformation.classrooms[classId].poll.allowMultipleResponses = allowMultipleResponses
        for (const key in classInformation.classrooms[classId].students) {
            classInformation.classrooms[classId].students[key].pollRes.buttonRes = ''
            classInformation.classrooms[classId].students[key].pollRes.textRes = ''
        }

        // Log data about the class then call the appropriate update functions
        logger.log('verbose', `[startPoll] classData=(${JSON.stringify(classInformation.classrooms[classId])})`)
        socketUpdates.classUpdate()
    } catch (err) {
        logger.log('error', err.stack);
    }
}

/**
 * Ends the current poll in the specified class, saves poll data to history, and updates the class state.
 * @param {number} classId - The ID of the class.
 * @param {Object} userSession - The user session object.
 */
async function endPoll(classId, userSession) {
    try {
        logger.log('info', `[endPoll] session=(${JSON.stringify(userSession)})`)

        let data = { prompt: '', names: [], letter: [], text: [] }
        let dateConfig = new Date()
        let date = `${dateConfig.getMonth() + 1}/${dateConfig.getDate()}/${dateConfig.getFullYear()}`

        data.prompt = classInformation.classrooms[classId].poll.prompt
        data.responses = classInformation.classrooms[classId].poll.responses
        data.allowMultipleResponses = classInformation.classrooms[classId].poll.allowMultipleResponses
        data.blind = classInformation.classrooms[classId].poll.blind
        data.allowTextResponses = classInformation.classrooms[classId].poll.allowTextResponses

        for (const key in classInformation.classrooms[classId].students) {
            data.names.push(classInformation.classrooms[classId].students[key].email)
            data.letter.push(classInformation.classrooms[classId].students[key].pollRes.buttonRes)
            data.text.push(classInformation.classrooms[classId].students[key].pollRes.textRes)
        }

        await new Promise((resolve, reject) => {
            database.run(
                'INSERT INTO poll_history(class, data, date) VALUES(?, ?, ?)',
                [classId, JSON.stringify(data), date], (err) => {
                    if (err) {
                        logger.log('error', err.stack);
                        reject(new Error(err));
                    } else {
                        logger.log('verbose', '[endPoll] saved poll to history');
                        resolve();
                    }
                }
            );
        });

        let latestPoll = await new Promise((resolve, reject) => {
            database.get('SELECT * FROM poll_history WHERE class=? ORDER BY id DESC LIMIT 1', [
                classId
            ], (err, poll) => {
                if (err) {
                    logger.log("error", err.stack);
                    reject(new Error(err));
                } else resolve(poll);
            });
        });

        latestPoll.data = JSON.parse(latestPoll.data);
        classInformation.classrooms[classId].pollHistory.push(latestPoll);
        classInformation.classrooms[classId].poll.status = false

        const socketUpdates = userSocketUpdates[userSession.email];
        socketUpdates.classUpdate();

        logger.log('verbose', `[endPoll] classData=(${JSON.stringify(classInformation.classrooms[classId])})`)
    } catch (err) {
        logger.log('error', err.stack);
    }
}

/**
 * Clears the current poll in the specified class, optionally updates the class state,
 * and saves poll answers to the database.
 *
 * @param {number} classId - The ID of the class.
 * @param {Object} userSession - The user session object.
 * @param {boolean} [updateClass=true] - Whether to update the class state after clearing the poll.
 */
async function clearPoll(classId, userSession, updateClass = true){
    try {
        const socketUpdates = userSocketUpdates[userSession.email];
        if (classInformation.classrooms[classId].poll.status) {
            await endPoll(classId, userSession)
        }

        classInformation.classrooms[classId].poll.responses = {};
        classInformation.classrooms[classId].poll.prompt = "";
        classInformation.classrooms[classId].poll = {
            status: false,
            responses: {},
            allowTextResponses: false,
            prompt: "",
            weight: 1,
            blind: false,
            requiredTags: [],
            studentsAllowedToVote: []
        };

        // Adds data to the previous poll answers table upon clearing the poll
        for (const student of Object.values(classInformation.classrooms[classId].students)) {
            if (student.classPermissions < MANAGER_PERMISSIONS) {
                const pollHistory = classInformation.classrooms[classId].pollHistory || []
                const currentPollId = pollHistory.length > 0 ? pollHistory[pollHistory.length - 1].id : undefined
                if (!currentPollId) {
                    continue
                }

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

        if (updateClass) {
            socketUpdates.classUpdate(classId);
        }
    } catch (err) {
        logger.log('error', err.stack);
    }
}

/**
 * Handles a student's poll response, updates their answer, manages pog meter, and triggers class updates.
 * @param {number} classId - The ID of the class.
 * @param {(string|string[])} res - The button response(s) from the student, or 'remove' to clear.
 * @param {string} textRes - The text response from the student.
 * @param {Object} userSession - The user session object.
 */
function pollResponse(classId, res, textRes, userSession) {
    const resLength = textRes != null ? textRes.length : 0;
    logger.log('info', `[pollResp] session=(${JSON.stringify(userSession)})`)
    logger.log('info', `[pollResp] res=(${res}) textRes=(${textRes}) resLength=(${resLength})`)

    const email = userSession.email;
    const user = classInformation.users[email];
    const classroom = classInformation.classrooms[classId];
    const socketUpdates = userSocketUpdates[email];

    if (!classroom.poll || !classroom.poll.status) {
        return;
    }

    const prevRes = classroom.students[email].pollRes.buttonRes;
    let hasChanged = classroom.poll.allowMultipleResponses ?
        JSON.stringify(prevRes) !== JSON.stringify(res) :
        prevRes !== res;

    if(!classroom.poll.allowVoteChanges && prevRes !== '' && (JSON.stringify(prevRes) !== JSON.stringify(res))) {
        return;
    }

    const isRemoving = res === 'remove' || (classroom.poll.allowMultipleResponses && Array.isArray(res) && res.length === 0);
    if (!classroom.poll.studentsAllowedToVote.includes(user.id.toString()) && !isRemoving) {
        return;
    }

    if (!classroom.poll.allowMultipleResponses) {
        if (res !== 'remove' && !Object.keys(classroom.poll.responses).includes(res)) {
            return;
        }
    } else {
        if (isRemoving) {
        } else if (!Array.isArray(res)) {
            return;
        } else {
            const validResponses = Object.keys(classroom.poll.responses);
            const allValid = res.every(response => validResponses.includes(response));
            if (!allValid) {
                return;
            }
        }
    }

    // If the user is removing their response and they previously had no response, do not play sound
    if (isRemoving && prevRes === '') {
        hasChanged = false;
    }

    if (hasChanged || classroom.students[email].pollRes.textRes !== textRes) {
        if (isRemoving) {
            advancedEmitToClass('removePollSound', classId, {})
        } else {
            advancedEmitToClass('pollSound', classId, {})
        }
    }

    if (isRemoving) {
        classroom.students[email].pollRes.buttonRes = classroom.poll.allowMultipleResponses ? [] : "";
        classroom.students[email].pollRes.textRes = "";
        classroom.students[email].pollRes.time = "";
    } else {
        classroom.students[email].pollRes.buttonRes = res;
        classroom.students[email].pollRes.textRes = textRes;
        classroom.students[email].pollRes.time = new Date();
    }

    if (!isRemoving && !pogMeterTracker.pogMeterIncreased[email]) {
        const resWeight = classroom.poll.responses[res].weight || 1;
        // Increase pog meter by 100 times the weight of the response
        // If pog meter reaches 500, increase digipogs by 1 and reset pog meter to 0
        const pogMeterIncrease = Math.floor(100 * resWeight);
        classroom.students[email].pogMeter += pogMeterIncrease;
        if (classroom.students[email].pogMeter >= 500) {
            classroom.students[email].pogMeter -= 500;
            database.run('UPDATE users SET digipogs = digipogs + 1 WHERE id = ?', [user.id], (err) => {
                if (err) {
                    logger.log('error', err.stack);
                } else {
                    logger.log('info', `[pollResp] User ${user.email} earned a Digipog`);
                }
            });
        }
        pogMeterTracker.pogMeterIncreased[email] = true;
    }
    logger.log('verbose', `[pollResp] user=(${classroom.students[userSession.email]})`)

    socketUpdates.classUpdate(classId, { global: true });
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

async function deleteCustomPolls(userId) {
    try {
        const customPolls = await dbGetAll('SELECT * FROM custom_polls WHERE owner=?', userId)
        if (customPolls.length == 0) return

        await dbRun('DELETE FROM custom_polls WHERE userId=?', customPolls[0].userId)

        for (let customPoll of customPolls) {
            await dbRun('DELETE FROM shared_polls WHERE pollId=?', customPoll.pollId)
        }
    } catch (err) {
        throw err
    }
}

module.exports = {
    createPoll,
    endPoll,
    clearPoll,
    pollResponse,
    getPollResponses,
    deleteCustomPolls,
    pogMeterTracker
}