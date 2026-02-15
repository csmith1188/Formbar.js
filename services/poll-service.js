const { classInformation } = require("@modules/class/classroom");

const { generateColors } = require("@modules/util");
const { advancedEmitToClass, userUpdateSocket } = require("@modules/socket-updates");
const { database, dbGet, dbGetAll, dbRun } = require("@modules/database");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { userSocketUpdates } = require("../sockets/init");
const NotFoundError = require("@errors/not-found-error");
const ValidationError = require("@errors/validation-error");
const { requireInternalParam } = require("@modules/error-wrapper");

// Stores an object containing the pog meter increases for users in a poll
// This is only stored in an object because Javascript passes objects as references
const pogMeterTracker = {
    pogMeterIncreased: [],
};

/**
 * Gets a classroom by ID and throws an error if not found.
 * @param {number} classId - The ID of the class.
 * @returns {Object} The classroom object.
 * @throws {NotFoundError} If classroom is not found.
 */
function getClassroom(classId) {
    const classroom = classInformation.classrooms[classId];
    if (!classroom) {
        throw new NotFoundError("Classroom not found");
    }
    return classroom;
}

/**
 * Resets all students' poll responses in a classroom.
 * @param {Object} classroom - The classroom object.
 */
function resetStudentPollResponses(classroom) {
    for (const key in classroom.students) {
        classroom.students[key].pollRes.buttonRes = "";
        classroom.students[key].pollRes.textRes = "";
    }
}

/**
 * Checks if a user is excluded from voting in a poll.
 * @param {Object} classroom - The classroom object.
 * @param {Object} user - The user object.
 * @param {Object} student - The student object.
 * @returns {boolean} True if user is excluded, false otherwise.
 */
function isUserExcludedFromVoting(classroom, user, student) {
    // Check if user is excluded from voting using poll.excludedRespondents
    if (classroom.poll.excludedRespondents && classroom.poll.excludedRespondents.includes(user.id)) {
        logger.log("info", `[pollResponse] User ${user.id} is excluded from voting`);
        return true;
    }

    // Check if user has the "Excluded" tag
    if (student && student.tags && Array.isArray(student.tags) && student.tags.includes("Excluded")) {
        logger.log("info", `[pollResponse] User ${user.id} is excluded from voting due to Excluded tag`);
        return true;
    }

    return false;
}

/**
 * Validates if a poll response is valid for the current poll.
 * @param {Object} poll - The poll object.
 * @param {(string|string[])} res - The response to validate.
 * @param {boolean} isRemoving - Whether the user is removing their response.
 * @returns {boolean} True if valid, false otherwise.
 */
function isValidPollResponse(poll, res, isRemoving) {
    if (!poll.allowMultipleResponses) {
        if (res !== "remove" && !poll.responses.some((response) => response.answer === res)) {
            return false;
        }
    } else {
        if (isRemoving) {
            return true;
        } else if (!Array.isArray(res)) {
            return false;
        } else {
            const validResponses = poll.responses.map((r) => r.answer);
            const allValid = res.every((response) => validResponses.includes(response));
            if (!allValid) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Calculates the weight of a poll response.
 * @param {Object} poll - The poll object.
 * @param {(string|string[])} res - The response.
 * @returns {number} The calculated weight.
 */
function calculateResponseWeight(poll, res) {
    let resWeight = 1;

    if (poll.allowMultipleResponses && Array.isArray(res)) {
        // Sum weights for all selected responses
        resWeight = res.reduce((sum, answer) => {
            const responseObj = poll.responses.find((response) => response.answer === answer);
            return sum + (responseObj ? responseObj.weight : 1);
        }, 0);
    } else {
        // Single response
        const responseObj = poll.responses.find((response) => response.answer === res);
        resWeight = responseObj ? responseObj.weight : 1;
    }

    return resWeight;
}

/**
 * Updates a student's poll response state.
 * @param {Object} student - The student object.
 * @param {(string|string[])} res - The button response.
 * @param {string} textRes - The text response.
 * @param {boolean} isRemoving - Whether the user is removing their response.
 * @param {boolean} allowMultipleResponses - Whether multiple responses are allowed.
 */
function updateStudentPollResponse(student, res, textRes, isRemoving, allowMultipleResponses) {
    if (isRemoving) {
        student.pollRes.buttonRes = allowMultipleResponses ? [] : "";
        student.pollRes.textRes = "";
        student.pollRes.time = "";
    } else {
        student.pollRes.buttonRes = res;
        student.pollRes.textRes = textRes;
        student.pollRes.time = new Date();
    }
}

/**
 * Broadcasts a class update to all user sockets.
 * @param {string} email - The user's email.
 * @param {number} classId - The class ID.
 */
function broadcastClassUpdate(email, classId) {
    userUpdateSocket(email, "classUpdate", classId, { global: true });
}

/**
 * Creates a new poll in the class.
 * @param {number} classId - The ID of the class.
 * @param {Object} pollData - The data for the poll.
 * @param {Object} userData - The user session object.
 * @returns {Promise<void>}
 * @throws {NotFoundError} If classroom is not found
 * @throws {ValidationError} If class is not active
 */
async function createPoll(classId, pollData, userData) {
    const { prompt, answers, blind, tags, weight, excludedRespondents, allowVoteChanges, indeterminate, allowTextResponses, allowMultipleResponses } =
        pollData;
    const numberOfResponses = Object.keys(answers).length;

    requireInternalParam(classId, "classId");
    requireInternalParam(pollData, "pollData");
    requireInternalParam(userData, "userData");

    pogMeterTracker.pogMeterIncreased = [];

    const classroom = getClassroom(classId);

    // Check if the class is active before continuing
    if (!classroom.isActive) {
        throw new ValidationError("This class is not currently active");
    }

    await clearPoll(classId, userData, false);
    const generatedColors = generateColors(Object.keys(answers).length);

    classroom.poll.allowVoteChanges = allowVoteChanges;
    classroom.poll.blind = blind;
    classroom.poll.status = true;

    // If excludedRespondents is provided and is a non-empty array, use it directly
    if (excludedRespondents && Array.isArray(excludedRespondents) && excludedRespondents.length > 0) {
        classroom.poll.excludedRespondents = excludedRespondents.map((id) => Number(id));
    }

    // Creates an object for every answer possible the teacher is allowing
    const letterString = "abcdefghijklmnopqrstuvwxyz";
    for (let i = 0; i < numberOfResponses; i++) {
        let answer = letterString[i];
        let weight = 1;
        let color = generatedColors[i];

        if (answers[i].answer) {
            answer = answers[i].answer;
        }

        if (answers[i].weight) {
            if (isNaN(answers[i].weight) || answers[i].weight <= 0) weight = 1;
            weight = Math.floor(answers[i].weight * 100) / 100;
            weight = weight > 5 ? 5 : weight;
        }

        if (answers[i].color) {
            color = answers[i].color;
        }

        classroom.poll.responses.push({
            answer: answer,
            weight: weight,
            color: color,
            correct: answers[i].correct,
        });
    }

    // Set the poll's data in the classroom
    classroom.poll.startTime = Date.now();
    classroom.poll.weight = weight;
    classroom.poll.allowTextResponses = allowTextResponses;
    classroom.poll.prompt = prompt;
    classroom.poll.allowMultipleResponses = allowMultipleResponses;

    resetStudentPollResponses(classroom);
    broadcastClassUpdate(userData.email, classId);
}

/**
 * Updates poll properties dynamically. Can update individual properties or clear the entire poll.
 * @param {number} classId - The ID of the class.
 * @param {Object} options - An object containing poll properties to update.
 * @param {Object} userSession - The user session object.
 * @returns {Promise<boolean>} True if successful.
 * @throws {ValidationError} If classId or options are missing
 * @throws {NotFoundError} If classroom is not found
 *
 * Examples:
 * - updatePoll(classId, {status: false}, session) - Ends the poll
 * - updatePoll(classId, {success: true}, session) - Resumes the poll
 * - updatePoll(classId, {}, session) - Clears the poll (empty object)
 */
async function updatePoll(classId, options, userSession) {
    // If no classId or options provided, throw validation error
    if (!classId || !options) {
        throw new ValidationError("Missing classId or options");
    }

    const classroom = getClassroom(classId);

    // If an empty object is sent, clear the current poll
    const optionsKeys = Object.keys(options);
    if (optionsKeys.length === 0) {
        await clearPoll(classId, userSession);
        return true;
    }

    // Update each poll property
    for (const option of Object.keys(options)) {
        let value = options[option];

        // Save to history when ending poll
        if (option === "status" && value === false && classroom.poll.status === true) {
            savePollToHistory(classId);
        }

        // If studentsAllowedToVote is being changed, then ensure it always contains numbers
        if (option === "studentsAllowedToVote" && Array.isArray(value)) {
            value = value.map((id) => Number(id));
        }

        // Update the property if it exists in the poll object
        if (option in classroom.poll) {
            classroom.poll[option] = value;
        }
    }

    // Broadcast update to all tabs
    const userSockets = userSocketUpdates.get(userSession.email);
    if (userSockets && userSockets.size > 0) {
        const firstSocket = userSockets.values().next().value;
        firstSocket.classUpdate(classId, { global: true });
    }
    return true;
}

/**
 * Gets previous polls for a class from the database with pagination.
 * @param classId
 * @param index
 * @param limit
 * @returns {Promise<Array<Object>>}
 */
function getPreviousPolls(classId, index = 0, limit = 20) {
    requireInternalParam(classId, "classId");
    return dbGetAll("SELECT * FROM poll_history WHERE class = ? ORDER BY id ASC LIMIT ?, ?", [classId, index, limit]);
}

/**
 * Saves the current poll data to the poll history table in the database.
 * @param {number} classId - The ID of the class whose poll should be saved.
 */
async function savePollToHistory(classId) {
    const classroom = classInformation.classrooms[classId];
    if (!classroom) return;

    const createdAt = Date.now();
    const prompt = classroom.poll.prompt;
    const responses = JSON.stringify(classroom.poll.responses);
    const allowMultipleResponses = classroom.poll.allowMultipleResponses ? 1 : 0;
    const blind = classroom.poll.blind ? 1 : 0;
    const allowTextResponses = classroom.poll.allowTextResponses ? 1 : 0;
    const names = [];
    const letter = [];
    const text = [];

    for (const key in classroom.students) {
        names.push(classroom.students[key].email);
        letter.push(classroom.students[key].pollRes.buttonRes);
        text.push(classroom.students[key].pollRes.textRes);
    }

    await dbRun(
        "INSERT INTO poll_history(class, prompt, responses, allowMultipleResponses, blind, allowTextResponses, createdAt) VALUES(?, ?, ?, ?, ?, ?, ?)",
        [classId, prompt, responses, allowMultipleResponses, blind, allowTextResponses, createdAt]
    );
}

/**
 * Clears the current poll in the specified class, optionally updates the class state,
 * and saves poll answers to the database.
 *
 * @param {number} classId - The ID of the class.
 * @param {Object} userSession - The user session object.
 * @param {boolean} [updateClass=true] - Whether to update the class state after clearing the poll.
 */
async function clearPoll(classId, userSession, updateClass = true) {
    if (classInformation.classrooms[classId].poll.status) {
        await updatePoll(classId, { status: false }, userSession);
    }

    classInformation.classrooms[classId].poll.responses = [];
    classInformation.classrooms[classId].poll.prompt = "";
    classInformation.classrooms[classId].poll = {
        status: false,
        responses: [],
        allowTextResponses: false,
        prompt: "",
        weight: 1,
        blind: false,
        excludedRespondents: [],
    };

    // Adds data to the previous poll answers table upon clearing the poll
    for (const student of Object.values(classInformation.classrooms[classId].students)) {
        if (student.classPermissions < MANAGER_PERMISSIONS) {
            const lastPoll = await dbGet("SELECT id FROM poll_history WHERE class = ? ORDER BY createdAt DESC LIMIT 1", [classId]);
            const currentPollId = lastPoll ? lastPoll.id : undefined;
            if (!currentPollId) {
                continue;
            }

            const buttonRes = student.pollRes.buttonRes;
            let buttonResponse;
            if (Array.isArray(buttonRes)) {
                // Multi-response: store the full string for each selected response
                buttonResponse = JSON.stringify(buttonRes);
            } else if (buttonRes !== "" && buttonRes !== null && buttonRes !== undefined) {
                // Single response: wrap in an array
                buttonResponse = JSON.stringify([buttonRes]);
            } else {
                buttonResponse = JSON.stringify([]);
            }

            const textResponse = student.pollRes.textRes || null;
            const studentId = student.id;
            await dbRun(
                "INSERT OR REPLACE INTO poll_answers(pollId, classId, userId, buttonResponse, textResponse, createdAt) VALUES(?, ?, ?, ?, ?, ?)",
                [currentPollId, classId, studentId, buttonResponse, textResponse, Date.now()]
            );
        }
    }

    if (updateClass && userSession) {
        broadcastClassUpdate(userSession.email, classId);
    }
}

/**
 * Handles a student's poll response, updates their answer, manages pog meter, and triggers class updates.
 * @param {number} classId - The ID of the class.
 * @param {(string|string[])} res - The button response(s) from the student, or 'remove' to clear.
 * @param {string} textRes - The text response from the student.
 * @param {Object} userSession - The user session object.
 */
function sendPollResponse(classId, res, textRes, userSession) {
    const resLength = textRes != null ? textRes.length : 0;

    const email = userSession.email;
    const user = classInformation.users[email];
    const classroom = classInformation.classrooms[classId];

    // If the classroom does not exist, return
    if (!classroom) {
        return;
    }

    // If there's no poll or the poll is not active, return
    if (!classroom.poll || !classroom.poll.status) {
        return;
    }

    const student = classroom.students[email];

    // Check if user is excluded from voting
    if (isUserExcludedFromVoting(classroom, user, student)) {
        return;
    }

    // If the user's response has not changed, return
    const prevRes = student.pollRes.buttonRes;
    let hasChanged = classroom.poll.allowMultipleResponses ? JSON.stringify(prevRes) !== JSON.stringify(res) : prevRes !== res;

    if (!classroom.poll.allowVoteChanges && prevRes !== "" && JSON.stringify(prevRes) !== JSON.stringify(res)) {
        return;
    }

    const isRemoving = res === "remove" || (classroom.poll.allowMultipleResponses && Array.isArray(res) && res.length === 0);

    // Validate poll response
    if (!isValidPollResponse(classroom.poll, res, isRemoving)) {
        return;
    }

    // If the user is removing their response and they previously had no response, do not play sound
    if (isRemoving && prevRes === "") {
        hasChanged = false;
    }

    if (hasChanged || student.pollRes.textRes !== textRes) {
        if (isRemoving) {
            advancedEmitToClass("removePollSound", classId, {});
        } else {
            advancedEmitToClass("pollSound", classId, {});
        }
    }

    // Update student's poll response
    updateStudentPollResponse(student, res, textRes, isRemoving, classroom.poll.allowMultipleResponses);

    // Handle pog meter updates
    if (!isRemoving && !pogMeterTracker.pogMeterIncreased[email]) {
        const resWeight = calculateResponseWeight(classroom.poll, res);

        // Increase pog meter by 100 times the weight of the response
        // If pog meter reaches 500, increase digipogs by 1 and reset pog meter to 0
        const pogMeterIncrease = Math.floor(100 * resWeight);
        student.pogMeter += pogMeterIncrease;
        if (student.pogMeter >= 500) {
            student.pogMeter -= 500;
            let addPogs = Math.floor(Math.random() * 10) + 1; // Randomly add between 1 and 10 digipogs
            database.run("UPDATE users SET digipogs = digipogs + ? WHERE id = ?", [addPogs, user.id], (err) => {
                if (err) {
                } else {
                }
            });
        }
        pogMeterTracker.pogMeterIncreased[email] = true;
    }

    broadcastClassUpdate(email, classId);
}

/**
 * Function to get the poll responses in a class.
 * @param {Object} classData - The data of the class.
 * @returns {Object} An object containing the poll responses.
 */
function getPollResponses(classData) {
    // Create an empty object to store the poll responses
    let tempPolls = {};

    // If the poll is not active, return an empty object
    if (!classData.poll.status) return {};

    // If there are no responses to the poll, return an empty object
    if (classData.poll.responses.length == 0) return {};

    // For each response in the poll responses
    for (let resValue of classData.poll.responses) {
        // Add the response to the tempPolls object and initialize the count of responses to 0
        tempPolls[resValue.answer] = {
            ...resValue,
            responses: 0,
        };
    }

    // For each student in the class
    for (let student of Object.values(classData.students)) {
        // If the student exists and has responded to the poll
        if (student && Object.keys(tempPolls).includes(student.pollRes.buttonRes)) {
            // Increment the count of responses for the student's response
            tempPolls[student.pollRes.buttonRes].responses++;
        }
    }

    // Return the tempPolls object
    return tempPolls;
}

/**
 * Deletes all custom polls owned by a user
 * @param {number} userId - The ID of the user whose custom polls should be deleted
 */
async function deleteCustomPolls(userId) {
    const customPolls = await dbGetAll("SELECT * FROM custom_polls WHERE owner=?", userId);
    if (customPolls.length == 0) return;

    await dbRun("DELETE FROM custom_polls WHERE owner=?", userId);
    for (let customPoll of customPolls) {
        await dbRun("DELETE FROM shared_polls WHERE pollId=?", customPoll.id);
    }
}

module.exports = {
    createPoll,
    updatePoll,
    getPreviousPolls,
    savePollToHistory,
    clearPoll,
    sendPollResponse,
    getPollResponses,
    deleteCustomPolls,
    pogMeterTracker,
};
