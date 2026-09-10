const { classStateStore } = require("@services/classroom-service");

const { generateColors } = require("@modules/util");
const { advancedEmitToClass, invalidateClassPollCache, userUpdateSocket } = require("@services/socket-updates-service");
const { dbGet, dbGetAll, dbRun } = require("@modules/database");
const { userHasScope } = require("@modules/scope-resolver");
const { SCOPES } = require("@modules/permissions");
const { userSocketUpdates } = require("../sockets/init");
const NotFoundError = require("@errors/not-found-error");
const ValidationError = require("@errors/validation-error");
const ForbiddenError = require("@errors/forbidden-error");
const { requireInternalParam } = require("@modules/error-wrapper");
const { pollRuntimeStore } = require("@stores/poll-runtime-store");

/**
 * Gets a classroom by ID and throws an error if not found.
 * @param {number} classId - The ID of the class.
 * @returns {Object} The classroom object.
 * @throws {NotFoundError} If classroom is not found.
 */
function getClassroom(classId) {
    const classroom = classStateStore.getClassroom(classId);
    if (!classroom) {
        throw new NotFoundError("Classroom not found");
    }
    return classroom;
}

/**
 * Resets all students' poll responses in a classroom.
 * @param {Object} classroom - The classroom object.
 * @returns {void}
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
    const userId = user?.id ?? student?.id;
    if (userId !== undefined && classroom.poll.excludedRespondents && classroom.poll.excludedRespondents.includes(userId)) {
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
    let resWeight;

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
 * Converts the selected button answers into the response option ids stored in poll_history.responses.
 * @param {Array<Object>} pollResponses - The response options for the saved poll.
 * @param {(string|string[])} buttonRes - The student's selected answer(s).
 * @returns {string|null} JSON array of selected response ids, or null when there are no button selections.
 */
function getSelectedResponseIds(pollResponses, buttonRes) {
    const selectedAnswers = Array.isArray(buttonRes)
        ? buttonRes
        : buttonRes !== "" && buttonRes !== null && buttonRes !== undefined
          ? [buttonRes]
          : [];

    if (selectedAnswers.length === 0) return null;

    const responseIdsByAnswer = new Map(pollResponses.map((response, index) => [response.answer, response.id ?? index]));
    const responseIds = selectedAnswers.filter((answer) => responseIdsByAnswer.has(answer)).map((answer) => responseIdsByAnswer.get(answer));

    return responseIds.length > 0 ? JSON.stringify(responseIds) : null;
}

function normalizePositiveNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeThresholdPercent(value) {
    const threshold = normalizePositiveNumber(value);
    if (threshold === null) return null;
    return Math.min(threshold > 1 ? threshold / 100 : threshold, 1);
}

/**
 * Whether clearing should insert a poll_history row for a poll that was never formally ended.
 * @param {Object|null|undefined} poll - The in-memory poll snapshot about to be cleared.
 * @returns {boolean} True when the poll is active or has a prompt or response options.
 */
function shouldArchivePollOnClear(poll) {
    if (!poll) return false;
    if (poll.status) return true;
    const hasPrompt = typeof poll.prompt === "string" && poll.prompt.trim() !== "";
    const hasResponses = Array.isArray(poll.responses) && poll.responses.length > 0;
    return hasPrompt || hasResponses;
}

function hasStudentAnsweredPoll(student) {
    if (!student || !student.pollRes) return false;

    const buttonRes = student.pollRes.buttonRes;
    if (Array.isArray(buttonRes)) {
        return buttonRes.length > 0;
    }

    if (buttonRes !== "" && buttonRes !== null && buttonRes !== undefined) {
        return true;
    }

    const textRes = student.pollRes.textRes;
    return textRes !== "" && textRes !== null && textRes !== undefined;
}

function getEligiblePollStudents(classroom) {
    if (!classroom || !classroom.students) return [];

    const excludedRespondents = Array.isArray(classroom.poll?.excludedRespondents) ? classroom.poll.excludedRespondents.map(Number) : [];

    return Object.values(classroom.students).filter((student) => {
        if (!student || student.isOffline || student.break === true) return false;
        if (excludedRespondents.includes(Number(student.id))) return false;
        if (userHasScope(student, SCOPES.CLASS.SYSTEM.ADMIN, classroom)) return false;
        return true;
    });
}

function getAutoEndDelay(classroom, autoEndTimer) {
    const configuredDelay = normalizePositiveNumber(autoEndTimer);
    if (configuredDelay === null) return null;

    const classTimer = classroom?.timer;
    if (!classTimer || !classTimer.active || !Number.isFinite(Number(classTimer.endTime))) {
        return configuredDelay;
    }

    const remainingClassTime = Number(classTimer.endTime) - Date.now();
    if (remainingClassTime <= 0) return null;

    return Math.min(configuredDelay, remainingClassTime);
}

function isAutoEndThresholdMet(classroom) {
    const threshold = normalizeThresholdPercent(classroom.poll?.autoEndThreshold);
    if (threshold === null) return true;

    const eligibleStudents = getEligiblePollStudents(classroom);
    if (eligibleStudents.length === 0) return false;

    const answeredStudents = eligibleStudents.filter(hasStudentAnsweredPoll).length;
    return answeredStudents / eligibleStudents.length >= threshold;
}

/**
 * Notifies connected clients that custom poll lists changed for a user.
 *
 * @param {string} email - User email.
 * @returns {void}
 */
function emitCustomPollUpdate(email) {
    if (!email) return;
    userUpdateSocket(email, "customPollUpdate", email);
}

function emitClassUpdate(classId, userSession) {
    if (userSession?.email) {
        const userSockets = userSocketUpdates.get(userSession.email);
        if (userSockets && userSockets.size > 0) {
            const firstSocketUpdates = userSockets.values().next().value;
            if (firstSocketUpdates && typeof firstSocketUpdates.classUpdate === "function") {
                firstSocketUpdates.classUpdate(classId, { global: true });
                return;
            }
        }
    }

    for (const socketUpdatesSet of userSocketUpdates.values()) {
        for (const socketUpdates of socketUpdatesSet.values()) {
            if (socketUpdates && typeof socketUpdates.classUpdate === "function") {
                socketUpdates.classUpdate(classId, { global: true });
                return;
            }
        }
    }
}

/**
 * Updates a student's poll response state.
 * @param {Object} student - The student object.
 * @param {(string|string[])} res - The button response.
 * @param {string} textRes - The text response.
 * @param {boolean} isRemoving - Whether the user is removing their response.
 * @param {boolean} allowMultipleResponses - Whether multiple responses are allowed.
 * @returns {void}
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
 * Creates a new poll in the class.
 * @param {number} classId - The ID of the class.
 * @param {Object} pollData - The data for the poll.
 * @param {Object} userData - The user session object.
 * @returns {Promise<void>}
 * @throws {NotFoundError} If classroom is not found
 * @throws {ValidationError} If class is not active
 */
async function createPoll(classId, pollData, userData) {
    const {
        prompt,
        answers,
        blind,
        weight,
        excludedRespondents,
        allowVoteChanges,
        allowTextResponses,
        allowMultipleResponses,
        autoEndTimer,
        autoEndThreshold,
        blindUntilEnded,
    } = pollData;
    const numberOfResponses = Object.keys(answers).length;
    const normalizedAutoEndTimer = normalizePositiveNumber(autoEndTimer);
    const normalizedAutoEndThreshold = normalizePositiveNumber(autoEndThreshold);
    const shouldBlindUntilEnded = blind ? blindUntilEnded !== false : !!blindUntilEnded;

    requireInternalParam(classId, "classId");
    requireInternalParam(pollData, "pollData");
    requireInternalParam(userData, "userData");

    pollRuntimeStore.resetPogMeterTracker(classId);

    const classroom = getClassroom(classId);

    // Check if the class is active before continuing
    if (!classroom.isActive) {
        throw new ValidationError("This class is not currently active");
    }

    await clearPoll(classId, userData, false);
    const generatedColors = generateColors(Object.keys(answers).length);

    classroom.poll.allowVoteChanges = allowVoteChanges;
    classroom.poll.blind = blind;
    classroom.poll.blindUntilEnded = shouldBlindUntilEnded;
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
            id: i,
            answer: answer,
            weight: weight,
            color: color,
            isCorrect: !!(answers[i].isCorrect ?? answers[i].correct),
        });
    }

    const pollStartTime = Date.now();

    // Set the poll's data in the classroom
    pollRuntimeStore.setPollStartTime(classId, pollStartTime);
    classroom.poll = {
        ...classroom.poll,
        startTime: pollStartTime,
        weight: weight,
        allowTextResponses: allowTextResponses,
        prompt: prompt,
        allowMultipleResponses: allowMultipleResponses,
        endTime: null,
        autoEndTimer: normalizedAutoEndTimer,
        autoEndThreshold: normalizedAutoEndThreshold,
        blindUntilEnded: shouldBlindUntilEnded,
    };

    resetStudentPollResponses(classroom);
    watchPoll(classId, classroom.poll);
    emitClassUpdate(classId, userData);
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
 * * - updatePoll(classId, {status: false}, session) - Ends the poll
 * * - updatePoll(classId, {success: true}, session) - Resumes the poll
 * * - updatePoll(classId, {}, session) - Clears the poll (empty object)
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
        await clearPoll(classId, userSession, false);
        return true;
    }

    // Update each poll property
    for (const option of Object.keys(options)) {
        let value = options[option];

        // Save to history when ending poll
        if (option === "status" && value === false && classroom.poll.status === true) {
            deleteWatchedPoll(classId);

            // If the poll is set to blind until ended, then unblind the poll
            if (classroom.poll.blindUntilEnded) {
                classroom.poll.blind = false;
            }

            classroom.poll.status = false;
            const savedPollId = await savePollToHistory(classId);
            pollRuntimeStore.setLastSavedPollId(classId, savedPollId);
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
    emitClassUpdate(classId, userSession);
    return true;
}

/**
 * Gets previous polls for a class from the database with pagination.
 * Post-processes results to ensure proper types (booleans as actual booleans, responses as parsed objects).
 * @param {number} classId - The ID of the class.
 * @param {number} [limit=20] - The maximum number of records to return.
 * @param {number} [offset=0] - The number of records to skip.
 * @param {boolean} [includeResponses=false] - Include user responses in the returned data?\
 * @returns {Promise<Object>} An object containing polls array and total count.
 */
async function getPreviousPolls(classId, limit = 20, offset = 0, includeResponses = false) {
    requireInternalParam(classId, "classId");

    const totalRow = await dbGet(`SELECT COUNT(*) AS count FROM poll_history WHERE class = ?`, [classId]);
    const polls = await dbGetAll(
        `SELECT *, ROW_NUMBER() OVER (ORDER BY id) AS pollId
         FROM poll_history
         WHERE class = ?
         ORDER BY id DESC
         LIMIT ? OFFSET ?`,
        [classId, limit, offset]
    );

    const enrichedPolls = await Promise.all(polls.map(async (poll) => {
        // Parse responses into a predictable array for clients.
        let parsedResponses = poll.responses;
        if (typeof poll.responses === "string") {
            try {
                parsedResponses = JSON.parse(poll.responses);
            } catch (err) {
                parsedResponses = [];
            }
        }

        if (!Array.isArray(parsedResponses)) {
            parsedResponses = [];
        }


		if(includeResponses) {
			parsedResponses.forEach((resp) => { resp.studentsResponded = [] });

			const userResponses = await dbGetAll("SELECT * FROM poll_answers WHERE classId = ? AND pollId = ?", [classId, poll.id]);

			userResponses.map((studentRes) => {
				const studentResponseIds = JSON.parse(studentRes.responseIds);
				const matchingResponses = parsedResponses.filter((response) => studentResponseIds.includes(response.id));
				matchingResponses.forEach((matchedResp) => matchedResp.studentsResponded.push(
					{
						userId: studentRes.userId,
						textResponse: studentRes.textResponse,
						respondedAt: studentRes.createdAt
					}
				));
			})
		}

        return {
            globalPollId: poll.id,
            classPollId: Number(poll.pollId),
            prompt: poll.prompt,
            responses: parsedResponses,
            blind: !!poll.blind,
            allowMultipleResponses: !!poll.allowMultipleResponses,
            allowTextResponses: !!poll.allowTextResponses,
            createdAt: poll.createdAt,
        };
    }));

    return {
        polls: enrichedPolls,
        total: totalRow ? totalRow.count : 0,
    };
}

/**
 * Saves the current poll data to the poll history table in the database.
 * @param {number} classId - The ID of the class whose poll should be saved.
 * @returns {Promise<void>}
 */
async function savePollToHistory(classId, pollSnapshot = null) {
    const classroom = classStateStore.getClassroom(classId);
    if (!classroom && !pollSnapshot) return;

    const pollToSave = pollSnapshot || classroom.poll;

    const createdAt = Date.now();
    const prompt = pollToSave.prompt;
    const responses = JSON.stringify(pollToSave.responses);
    const allowMultipleResponses = pollToSave.allowMultipleResponses ? 1 : 0;
    const blind = pollToSave.blind ? 1 : 0;
    const allowTextResponses = pollToSave.allowTextResponses ? 1 : 0;
    const autoEndTimer = pollToSave.autoEndTimer;
    const autoEndThreshold = pollToSave.autoEndThreshold;
    const blindUntilEnded = pollToSave.blindUntilEnded ? 1 : 0;

    return dbRun(
        "INSERT INTO poll_history(class, prompt, responses, allowMultipleResponses, blind, allowTextResponses, createdAt, auto_end_timer, auto_end_threshold, blind_until_ended) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [classId, prompt, responses, allowMultipleResponses, blind, allowTextResponses, createdAt, autoEndTimer, autoEndThreshold, blindUntilEnded]
    );
}

/**
 * Persists student responses into poll_answers when clearing/archiving the active poll.
 * @param {Object} classroom - The classroom object (students and scoped admins unchanged).
 * @param {number} currentPollId - The runtime-tracked poll id for inserted answers.
 * @param {number} classId - The ID of the class.
 * @param {Array<Object>} savedPollResponses - Response definitions captured before the poll metadata was cleared.
 * @returns {Promise<void>}
 */
async function savePollAnswersToHistory(classroom, currentPollId, classId, savedPollResponses) {
    const rows = [];
    for (const student of Object.values(classroom.students)) {
        if (!userHasScope(student, SCOPES.CLASS.SYSTEM.ADMIN, classroom)) {
            const buttonRes = student.pollRes.buttonRes;
            let buttonResponse = null;
            if (Array.isArray(buttonRes) && buttonRes.length > 0) {
                // Multi-response: store the full array
                buttonResponse = JSON.stringify(buttonRes);
            } else if (!Array.isArray(buttonRes) && buttonRes !== "" && buttonRes !== null && buttonRes !== undefined) {
                // Single response: wrap in an array
                buttonResponse = JSON.stringify([buttonRes]);
            }

            const textResponse = student.pollRes.textRes || null;
            const responseIds = getSelectedResponseIds(savedPollResponses, buttonRes);

            if (buttonResponse === null && textResponse === null) continue;

            const studentId = student.id;
            rows.push([currentPollId, classId, studentId, responseIds, buttonResponse, textResponse, Date.now()]);
        }
    }

    if (rows.length > 0) {
        const placeholders = rows.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(",");
        const values = rows.flat();

        await dbRun(
            `INSERT OR REPLACE INTO poll_answers(pollId, classId, userId, responseIds, buttonResponse, textResponse, createdAt) VALUES ${placeholders}`,
            values
        );
    }
}

/**
 * Clears the current poll in the specified class, optionally updates the class state,
 * and saves poll answers to the database.
 *
 * @param {number} classId - The ID of the class.
 * @param {Object} userSession - The user session object.
 * @param {boolean} [updateClass=true] - Whether to update the class state after clearing the poll.
 * @returns {Promise<void>}
 */
async function clearPoll(classId, userSession, updateClass = true) {
    const classroom = classStateStore.getClassroom(classId);
    deleteWatchedPoll(classId);

    const pollSnapshot = structuredClone(classroom.poll);
    let currentPollId = pollRuntimeStore.getLastSavedPollId(classId);
    const savedPollResponses = pollSnapshot.responses;

    // If this poll was never ended, create a history row now so clear-without-end still archives.
    if (!currentPollId && shouldArchivePollOnClear(pollSnapshot)) {
        currentPollId = await savePollToHistory(classId, pollSnapshot);
    }

    classroom.poll.responses = [];
    classroom.poll.prompt = "";
    classroom.poll = {
        status: false,
        responses: [],
        allowTextResponses: false,
        prompt: "",
        weight: 1,
        blind: false,
        blindUntilEnded: false,
        endTime: null,
        autoEndTimer: null,
        autoEndThreshold: null,
        excludedRespondents: [],
    };

    if (currentPollId) {
        await savePollAnswersToHistory(classroom, currentPollId, classId, savedPollResponses);
    }

    if (updateClass && userSession) {
        emitClassUpdate(classId, userSession);
    }

    pollRuntimeStore.clearPogMeterTracker(classId);
    pollRuntimeStore.clearLastSavedPollId(classId);
    pollRuntimeStore.clearPollStartTime(classId);
}

/**
 * Handles a student's poll response, updates their answer, manages pog meter, and triggers class updates.
 * @param {number} classId - The ID of the class.
 * @param {(string|string[])} res - The button response(s) from the student, or 'remove' to clear.
 * @param {string} textRes - The text response from the student.
 * @param {Object} userSession - The user session object.
 * @returns {void}
 */
async function sendPollResponse(classId, res, textRes, userSession) {
    const resLength = textRes != null ? textRes.length : 0;

    const email = userSession.email;
    const user = classStateStore.getUser(email);
    const classroom = classStateStore.getClassroom(classId);

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
    if (!isRemoving && !pollRuntimeStore.hasPogMeterIncreased(classId, email)) {
        const resWeight = calculateResponseWeight(classroom.poll, res);

        // Increase pog meter by 100 times the weight of the response
        // If pog meter reaches 100, increase digipogs by 1 and reset pog meter to 0
        const pogMeterIncrease = Math.floor((process.env.POG_METER_INCREMENT || 20) * resWeight);
        student.pogMeter += pogMeterIncrease;
        if (student.pogMeter >= 100) {
            student.pogMeter -= 100;
            let addPogs = Math.floor(Math.random() * 10) + 1; // Randomly add between 1 and 10 digipogs
            await dbRun("UPDATE users SET digipogs = digipogs + ? WHERE id = ?", [addPogs, student.id]);
        }

        await dbRun("UPDATE users SET pog_meter = ? WHERE id = ?", [student.pogMeter, student.id]);

        pollRuntimeStore.markPogMeterIncreased(classId, email);
    }

    watchPoll(classId, classroom.poll);
    emitClassUpdate(classId, userSession);
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
 * Gets the current poll for an active class and validates access.
 * @param {number|string} classId - The class ID.
 * @param {Object} userData - The requesting user session object.
 * @returns {Promise<Object>} Poll data including total student count.
 * @throws {ValidationError} If required params are missing.
 * @throws {NotFoundError} If class does not exist or is not currently active.
 * @throws {ForbiddenError} If user is not in the class.
 */
async function getCurrentPoll(classId, userData) {
    requireInternalParam(classId, "classId");
    requireInternalParam(userData, "userData");

    const classroom = classStateStore.getClassroom(classId);

    if (!classroom) {
        const classroomRow = await dbGet("SELECT id FROM classroom WHERE id = ?", [classId]);
        if (classroomRow) {
            throw new NotFoundError("This class is not currently active");
        }
        throw new NotFoundError("This class does not exist");
    }

    if (!classroom.students[userData.email]) {
        throw new ForbiddenError("You do not have permission to view polls in this class");
    }

    const poll = structuredClone(classroom.poll);
    return {
        ...poll,
        status: poll.status,
        totalStudents: Object.keys(classroom.students).length,
    };
}

/**
 * Normalizes a custom_polls database row for API responses.
 *
 * @param {Object} row - Raw custom_polls row.
 * @returns {Object|null}
 */
function formatCustomPollRow(row) {
    if (!row) return null;

    return {
        id: row.id,
        owner: row.owner != null ? Number(row.owner) : null,
        name: row.name,
        prompt: row.prompt,
        answers: typeof row.answers === "string" ? JSON.parse(row.answers) : row.answers,
        allowTextResponses: !!row.textRes,
        blind: !!row.blind,
        allowVoteChanges: !!row.allowVoteChanges,
        allowMultipleResponses: !!row.allowMultipleResponses,
        weight: row.weight,
        public: !!row.public,
    };
}

/**
 * Returns saved poll templates for a user (owned, shared, and public).
 *
 * @param {number} userId - User ID.
 * @returns {Promise<Object[]>}
 */
async function getUserPollTemplates(userId) {
    requireInternalParam(userId, "userId");

    const owned = await dbGetAll("SELECT * FROM custom_polls WHERE owner = ?", [userId]);
    const shared = await dbGetAll(
        `SELECT cp.* FROM custom_polls cp
         INNER JOIN shared_polls sp ON sp.pollId = cp.id
         WHERE sp.userId = ?`,
        [userId]
    );
    const publicPolls = await dbGetAll("SELECT * FROM custom_polls WHERE public = 1");

    const byId = new Map();
    for (const row of [...owned, ...shared, ...publicPolls]) {
        byId.set(row.id, formatCustomPollRow(row));
    }

    return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

/**
 * Returns saved poll templates linked to a class.
 *
 * @param {number} classId - Class ID.
 * @returns {Promise<Object[]>}
 */
async function getClassPollTemplates(classId) {
    requireInternalParam(classId, "classId");

    const classroomRow = await dbGet("SELECT id FROM classroom WHERE id = ?", [classId]);
    if (!classroomRow) {
        throw new NotFoundError("There is no class with that id.");
    }

    const rows = await dbGetAll(
        `SELECT custom_poll.* FROM custom_polls custom_poll
         INNER JOIN class_polls class_poll ON class_poll.pollId = custom_poll.id
         WHERE class_poll.classId = ?
         ORDER BY custom_poll.id ASC`,
        [classId]
    );

    return rows.map(formatCustomPollRow);
}

/**
 * Inserts a row into custom_polls for a poll editor template.
 *
 * @param {number} userId - Owning user ID.
 * @param {Object} pollData - Poll template fields from the editor.
 * @returns {Promise<number>} New custom poll ID.
 */
async function insertCustomPollTemplate(userId, pollData) {
    const name = typeof pollData.name === "string" ? pollData.name.trim() : "";
    if (!name) {
        throw new ValidationError("Poll name is required.");
    }

    const prompt = typeof pollData.prompt === "string" ? pollData.prompt.trim() : "";
    if (!prompt) {
        throw new ValidationError("Poll prompt is required.");
    }

    if (!Array.isArray(pollData.answers) || pollData.answers.length === 0) {
        throw new ValidationError("At least one poll answer is required.");
    }

    const textRes = pollData.textRes != null ? (pollData.textRes ? 1 : 0) : pollData.allowTextResponses ? 1 : 0;

    return dbRun(
        "INSERT INTO custom_polls (owner, name, prompt, answers, textRes, blind, allowVoteChanges, allowMultipleResponses, weight, public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            userId,
            name,
            prompt,
            JSON.stringify(pollData.answers),
            textRes,
            pollData.blind ? 1 : 0,
            pollData.allowVoteChanges !== false ? 1 : 0,
            pollData.allowMultipleResponses ? 1 : 0,
            pollData.weight ?? 1,
            pollData.public ? 1 : 0,
        ]
    );
}

/**
 * Notifies all members in an active class that custom poll lists changed.
 *
 * @param {number} classId - Class ID.
 * @returns {void}
 */
function emitCustomPollUpdateForClass(classId) {
    const classroom = classStateStore.getClassroom(classId);
    if (!classroom?.students) return;

    for (const studentEmail of Object.keys(classroom.students)) {
        emitCustomPollUpdate(studentEmail);
    }
}

/**
 * Saves a poll template to the current user's custom poll library.
 *
 * @param {number|null} classId - Active class ID used for in-memory student state (optional).
 * @param {Object} pollData - Poll template fields from the editor.
 * @param {Object} userSession - Authenticated user session.
 * @returns {Promise<{ pollId: number, message: string }>}
 */
async function saveUserPollTemplate(classId, pollData, userSession) {
    requireInternalParam(pollData, "pollData");
    requireInternalParam(userSession, "userSession");

    const userId = userSession.userId ?? userSession.id;
    const email = userSession.email;
    const pollId = await insertCustomPollTemplate(userId, pollData);

    if (classId) {
        const classroom = getClassroom(classId);
        if (email && classroom.students[email]) {
            classStateStore.updateClassroomStudent(classId, email, (student) => {
                if (!Array.isArray(student.ownedPolls)) {
                    student.ownedPolls = [];
                }
                student.ownedPolls.push(pollId);
            });
        }
    }

    emitCustomPollUpdate(email);

    return {
        pollId,
        message: "Poll saved successfully!",
    };
}

/**
 * Saves a poll template to the class library (visible to other teachers in the class).
 *
 * @param {number} classId - Class ID.
 * @param {Object} pollData - Poll template fields from the editor.
 * @param {Object} userSession - Authenticated user session.
 * @returns {Promise<{ pollId: number, message: string }>}
 */
async function saveClassPollTemplate(classId, pollData, userSession) {
    requireInternalParam(classId, "classId");
    requireInternalParam(pollData, "pollData");
    requireInternalParam(userSession, "userSession");

    const userId = userSession.userId ?? userSession.id;
    const email = userSession.email;
    const classroom = getClassroom(classId);

    const classroomRow = await dbGet("SELECT * FROM classroom WHERE id=?", [classId]);
    if (!classroomRow) {
        throw new NotFoundError("There is no class with that code.");
    }

    const pollId = await insertCustomPollTemplate(userId, pollData);
    await dbRun("INSERT INTO class_polls (pollId, classId) VALUES (?, ?)", [pollId, classroomRow.id]);
    invalidateClassPollCache(classroomRow.id);

    if (email && classroom.students[email]) {
        classStateStore.updateClassroomStudent(classId, email, (student) => {
            if (!Array.isArray(student.ownedPolls)) {
                student.ownedPolls = [];
            }
            student.ownedPolls.push(pollId);
        });
    }

    emitCustomPollUpdateForClass(classId);

    return {
        pollId,
        message: "Poll saved to class.",
    };
}

/**
 * Deletes all custom polls owned by a user
 * @param {number} userId - The ID of the user whose custom polls should be deleted
 * @returns {Promise<void>}
 */
async function deleteCustomPolls(userId) {
    const customPolls = await dbGetAll("SELECT * FROM custom_polls WHERE owner=?", userId);
    if (customPolls.length == 0) return;

    await dbRun("DELETE FROM custom_polls WHERE owner=?", userId);
    for (let customPoll of customPolls) {
        await dbRun("DELETE FROM shared_polls WHERE pollId=?", customPoll.id);
    }
}

// Map of classId to timeout id
// Used to clear the timeout when the poll is cleared
const watchedPolls = new Map();

/**
 * Watches the poll for certain conditions which will trigger an automatic end of the poll.
 * @param {number} classId - The ID of the class.
 * @returns {boolean} True if the poll is being watched, false otherwise.
 */
function watchPoll(classId, pollData) {
    const classroom = classStateStore.getClassroom(classId);
    if (!classroom || !classroom.poll || !classroom.poll.status || watchedPolls.has(classId)) return false;

    const autoEndTimer = normalizePositiveNumber(pollData.autoEndTimer);
    if (autoEndTimer === null || !isAutoEndThresholdMet(classroom)) return false;

    const autoEndDelay = getAutoEndDelay(classroom, autoEndTimer);
    if (autoEndDelay === null) return false;

    const pollStartTime = classroom.poll.startTime;
    classroom.poll.endTime = Date.now() + autoEndDelay;

    const timer = setTimeout(async () => {
        const activeClassroom = classStateStore.getClassroom(classId);
        watchedPolls.delete(classId);

        if (!activeClassroom || !activeClassroom.poll || !activeClassroom.poll.status || activeClassroom.poll.startTime !== pollStartTime) {
            return;
        }

        await updatePoll(classId, { status: false }, null);
    }, autoEndDelay);

    if (typeof timer.unref === "function") {
        timer.unref();
    }

    watchedPolls.set(classId, timer);
    return true;
}

function deleteWatchedPoll(classId) {
    const timer = watchedPolls.get(classId);
    if (!timer) return;

    clearTimeout(watchedPolls.get(classId));
    watchedPolls.delete(classId);
}

module.exports = {
    createPoll,
    updatePoll,
    getPreviousPolls,
    getCurrentPoll,
    savePollToHistory,
    clearPoll,
    sendPollResponse,
    getPollResponses,
    deleteCustomPolls,
    saveUserPollTemplate,
    saveClassPollTemplate,
    getUserPollTemplates,
    getClassPollTemplates,
    pollRuntimeStore,
    deleteWatchedPoll,
};
