const { classInformation } = require("@modules/class/classroom");
const { logger } = require("@modules/logger");
const { generateColors } = require("@modules/util");
const { advancedEmitToClass, userUpdateSocket } = require("@modules/socketUpdates");
const { database, dbGetAll, dbRun } = require("@modules/database");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { userSocketUpdates } = require("../sockets/init");
const NotFoundError = require("@errors/not-found-error");
const ValidationError = require("@errors/validation-error");

// Stores an object containing the pog meter increases for users in a poll
// This is only stored in an object because Javascript passes objects as references
const pogMeterTracker = {
    pogMeterIncreased: [],
};

/**
 * Creates a new poll in the class.
 * @param {number} classId - The ID of the class.
 * @param {Object} pollData - The data for the poll.
 * @param {Object} userSession - The user session object.
 * @returns {Promise<void>}
 * @throws {NotFoundError} If classroom is not found
 * @throws {ValidationError} If class is not active
 */
async function createPoll(classId, pollData, userSession) {
    const { prompt, answers, blind, tags, excludedRespondents, allowVoteChanges, indeterminate, allowTextResponses, allowMultipleResponses } =
        pollData;
    let { weight } = pollData;
    const numberOfResponses = Object.keys(answers).length;
    pogMeterTracker.pogMeterIncreased = [];

    const classroom = classInformation.classrooms[classId];
    if (!classroom) {
        throw new NotFoundError("Classroom not found");
    }

    // Check if the class is active before continuing
    if (!classroom.isActive) {
        throw new ValidationError("This class is not currently active");
    }

    // Log poll information
    logger.log("info", `[createPoll] session=(${JSON.stringify(userSession)})`);
    logger.log(
        "info",
        `[createPoll] allowTextResponses=(${allowTextResponses}) prompt=(${prompt}) answers=(${JSON.stringify(answers)}) blind=(${blind}) weight=(${weight}) tags=(${tags})`
    );

    await clearPoll(classId, userSession, false);
    const generatedColors = generateColors(Object.keys(answers).length);
    logger.log("verbose", `[createPoll] user=(${classroom.students[userSession.email]})`);

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

    for (const key in classroom.students) {
        classroom.students[key].pollRes.buttonRes = "";
        classroom.students[key].pollRes.textRes = "";
    }

    // Log data about the class then call the appropriate update functions
    logger.log("verbose", `[createPoll] classData=(${JSON.stringify(classroom)})`);
    userUpdateSocket(userSession.email, "classUpdate", classId, { global: true });
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

    // If the classroom does not exist, throw not found error
    const classroom = classInformation.classrooms[classId];
    if (!classroom) {
        throw new NotFoundError("Classroom not found");
    }

    logger.log("info", `[updatePoll] classId=(${classId}) options=(${JSON.stringify(options)})`);

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
    const socketUpdate = userSocketUpdates[userSession.email];
    for (const socketId in socketUpdate) {
        socketUpdate[socketId].classUpdate(classId, { global: true });
        break; // only needs to be called once because it's global
    }
    return true;
}

/**
 * Saves the current poll data to the poll history table in the database.
 * @param {number} classId - The ID of the class whose poll should be saved.
 */
async function savePollToHistory(classId) {
    const classroom = classInformation.classrooms[classId];
    if (!classroom) return;

    const date = new Date();
    const formattedDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    const data = {
        prompt: classroom.poll.prompt,
        responses: classroom.poll.responses,
        allowMultipleResponses: classroom.poll.allowMultipleResponses,
        blind: classroom.poll.blind,
        allowTextResponses: classroom.poll.allowTextResponses,
        names: [],
        letter: [],
        text: [],
    };

    for (const key in classroom.students) {
        data.names.push(classroom.students[key].email);
        data.letter.push(classroom.students[key].pollRes.buttonRes);
        data.text.push(classroom.students[key].pollRes.textRes);
    }

    await dbRun("INSERT INTO poll_history(class, data, date) VALUES(?, ?, ?)", [classId, JSON.stringify(data), formattedDate]);

    logger.log("verbose", "[savePollToHistory] saved poll to history");
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
            const pollHistory = classInformation.classrooms[classId].pollHistory || [];
            const currentPollId = pollHistory.length > 0 ? pollHistory[pollHistory.length - 1].id : undefined;
            if (!currentPollId) {
                continue;
            }

            for (let i = 0; i < student.pollRes.buttonRes.length; i++) {
                const studentRes = student.pollRes.buttonRes[i];
                const studentId = student.id;
                await dbRun("INSERT INTO poll_answers(pollId, userId, buttonResponse) VALUES(?, ?, ?)", [currentPollId, studentId, studentRes]);
            }

            const studentTextRes = student.pollRes.textRes;
            const studentId = student.id;
            await dbRun("INSERT INTO poll_answers(pollId, userId, textResponse) VALUES(?, ?, ?)", [currentPollId, studentId, studentTextRes]);
        }
    }

    if (updateClass && userSession) {
        userUpdateSocket(userSession.email, "classUpdate", classId, { global: true });
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
    logger.log("info", `[pollResponse] session=(${JSON.stringify(userSession)})`);
    logger.log("info", `[pollResponse] res=(${res}) textRes=(${textRes}) resLength=(${resLength})`);

    const email = userSession.email;
    const user = classInformation.users[email];
    const classroom = classInformation.classrooms[classId];

    // If the classroom does not exist, return
    if (!classroom) {
        logger.log("warning", `[pollResponse WARNING] session=(${JSON.stringify(userSession)}) - Classroom not found for classId ${classId}`);
        return;
    }

    // If there's no poll or the poll is not active, return
    if (!classroom.poll || !classroom.poll.status) {
        return;
    }

    // Check if user is excluded from voting using poll.excludedRespondents
    if (classroom.poll.excludedRespondents && classroom.poll.excludedRespondents.includes(user.id)) {
        logger.log("info", `[pollResponse] User ${user.id} is excluded from voting`);
        return;
    }

    // Check if user has the "Excluded" tag
    const student = classroom.students[email];
    if (student && student.tags && Array.isArray(student.tags) && student.tags.includes("Excluded")) {
        logger.log("info", `[pollResponse] User ${user.id} is excluded from voting due to Excluded tag`);
        return;
    }

    // If the user's response has not changed, return
    const prevRes = classroom.students[email].pollRes.buttonRes;
    let hasChanged = classroom.poll.allowMultipleResponses ? JSON.stringify(prevRes) !== JSON.stringify(res) : prevRes !== res;

    if (!classroom.poll.allowVoteChanges && prevRes !== "" && JSON.stringify(prevRes) !== JSON.stringify(res)) {
        return;
    }

    const isRemoving = res === "remove" || (classroom.poll.allowMultipleResponses && Array.isArray(res) && res.length === 0);

    if (!classroom.poll.allowMultipleResponses) {
        if (res !== "remove" && !classroom.poll.responses.some((response) => response.answer === res)) {
            return;
        }
    } else {
        if (isRemoving) {
        } else if (!Array.isArray(res)) {
            return;
        } else {
            const validResponses = classroom.poll.responses.map((r) => r.answer);
            const allValid = res.every((response) => validResponses.includes(response));
            if (!allValid) {
                return;
            }
        }
    }

    // If the user is removing their response and they previously had no response, do not play sound
    if (isRemoving && prevRes === "") {
        hasChanged = false;
    }

    if (hasChanged || classroom.students[email].pollRes.textRes !== textRes) {
        if (isRemoving) {
            advancedEmitToClass("removePollSound", classId, {});
        } else {
            advancedEmitToClass("pollSound", classId, {});
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
        const responseObj = classroom.poll.responses.find((response) => response.answer === res);
        const resWeight = responseObj ? responseObj.weight : 1;

        // Increase pog meter by 100 times the weight of the response
        // If pog meter reaches 500, increase digipogs by 1 and reset pog meter to 0
        const pogMeterIncrease = Math.floor(100 * resWeight);
        classroom.students[email].pogMeter += pogMeterIncrease;
        if (classroom.students[email].pogMeter >= 500) {
            classroom.students[email].pogMeter -= 500;
            let addPogs = Math.floor(Math.random() * 10) + 1; // Randomly add between 1 and 3 digipogs
            database.run("UPDATE users SET digipogs = digipogs + ? WHERE id = ?", [addPogs, user.id], (err) => {
                if (err) {
                    logger.log("error", err.stack);
                } else {
                    logger.log("info", `[pollResponse] User ${user.email} earned a Digipog`);
                }
            });
        }
        pogMeterTracker.pogMeterIncreased[email] = true;
    }
    logger.log("verbose", `[pollResponse] user=(${classroom.students[userSession.email]})`);

    userUpdateSocket(email, "classUpdate", classId, { global: true });
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
        await dbRun("DELETE FROM shared_polls WHERE pollId=?", customPoll.pollId);
    }
}

module.exports = {
    createPoll,
    updatePoll,
    savePollToHistory,
    clearPoll,
    pollResponse,
    getPollResponses,
    deleteCustomPolls,
    pogMeterTracker,
};
