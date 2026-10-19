const { classStateStore } = require("@services/classroom-service");
const { database, dbGetAll } = require("@modules/database");
const { SCOPES, parseScopesField, MANAGER_PERMISSIONS } = require("@modules/permissions");
const { userHasScope, getClassAccessProfile, getGlobalPermissionLevelForUser } = require("@modules/scope-resolver");
const { getManagerData } = require("@services/manager-service");
const { io } = require("@modules/web-server");
const { socketStateStore } = require("@stores/socket-state-store");

const runningTimers = socketStateStore.getRunningTimers();
const rateLimits = socketStateStore.getRateLimits();
const userSockets = socketStateStore.getUserSockets();
const classPollIdCache = new Map();
const CLASS_POLL_CACHE_TTL_MS = 5000;

// These events will not display a permission error if the user does not have permission to use them
const PASSIVE_SOCKETS = [
    "classUpdate",
    "managerUpdate",
    "ipUpdate",
    "customPollUpdate",
    "classBannedUsersUpdate",
    "isClassActive",
    "setClassSetting",
];

/**
 * Get poll IDs associated with a class.
 * @param {number} classId - classId.
 * @returns {Promise<number[]>}
 */
async function getClassPollIds(classId) {
    const cacheKey = String(classId);
    const cached = classPollIdCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
        return cached.pollIds;
    }

    const classroomPollRows = await dbGetAll("SELECT pollId FROM class_polls WHERE classId = ?", [classId]);
    const pollIds = classroomPollRows.map((row) => row.pollId);
    classPollIdCache.set(cacheKey, {
        pollIds,
        expiresAt: now + CLASS_POLL_CACHE_TTL_MS,
    });
    return pollIds;
}

/**
 * Clear cached poll IDs for a class.
 * @param {number} classId - classId.
 * @returns {void}
 */
function invalidateClassPollCache(classId) {
    if (classId == null) {
        classPollIdCache.clear();
        return;
    }
    classPollIdCache.delete(String(classId));
}

/**
 * Emit a socket event to all sockets for a user.
 * @param {string} email - email.
 * @param {string} event - event.
 * @param {*} data - data.
 * @returns {Promise<void>}
 */
async function emitToUser(email, event, ...data) {
    const sockets = socketStateStore.getUserSocketsByEmail(email);
    if (!sockets) return;

    for (const socket of Object.values(sockets)) {
        socket.emit(event, ...data);
    }
}

/**
 * Calls a SocketUpdates method on all sockets for a user
 * @param {string} email - The user's email
 * @param {string} methodName - The name of the SocketUpdates method to call (e.g., 'classUpdate', 'customPollUpdate')
 * @param {...any} args - Arguments to pass to the method
 * @returns {boolean}
 */
function userUpdateSocket(email, methodName, ...args) {
    // Dynamically load to prevent circular dependency error
    const { userSocketUpdates } = require("../sockets/init");

    // If user has no socket connections yet, then return
    const userSockets = userSocketUpdates.get(email);
    if (!userSockets || userSockets.size === 0) {
        return false;
    }

    let emitted = false;
    for (const socketUpdates of userSockets.values()) {
        if (socketUpdates && typeof socketUpdates[methodName] === "function") {
            socketUpdates[methodName](...args);
            emitted = true;
        }
    }
    return emitted;
}

// Scopes that grant access to the control panel
// A user must have all of these scopes to have access to the control panel
const CONTROL_PANEL_SCOPES = [SCOPES.CLASS.SYSTEM.PANEL_ACCESS];

/**
 * Checks if a class user has access to the control panel.
 * @param {Object} user - The class user object
 * @param {Object} classroom - The classroom object
 * @returns {boolean}
 */
function hasControlPanelAccess(user, classroom) {
    return CONTROL_PANEL_SCOPES.every((scope) => userHasScope(user, scope, classroom));
}

/**
 * Resolve which parts of the class snapshot a viewer can access.
 *
 * @param {Object} viewer - viewer.
 * @param {Object} classroom - classroom.
 * @param {boolean} [controlPanelOverride=false] - controlPanelOverride.
 * @returns {Object}
 */
function getClassUpdateAccess(viewer, classroom, controlPanelOverride = false) {
    const hasControlPanel = controlPanelOverride || hasControlPanelAccess(viewer, classroom);

    return {
        hasControlPanel,
        canReadCorrectPollAnswers:
            hasControlPanel || userHasScope(viewer, SCOPES.CLASS.POLL.READ_CORRECT_ANSWERS, classroom) || classroom.poll.status === false,
        canReadStudents: hasControlPanel || userHasScope(viewer, SCOPES.CLASS.STUDENTS.READ, classroom),
        canReadPoll: hasControlPanel || userHasScope(viewer, SCOPES.CLASS.POLL.READ, classroom),
        canReadRoles: hasControlPanel || userHasScope(viewer, SCOPES.CLASS.ROLES.READ, classroom),
        canReadSettings: hasControlPanel || userHasScope(viewer, SCOPES.CLASS.SESSION.SETTINGS, classroom),
        canReadTimer: hasControlPanel || userHasScope(viewer, SCOPES.CLASS.TIMER.READ, classroom),
        canReadKey: hasControlPanel || userHasScope(viewer, SCOPES.CLASS.SESSION.REGENERATE_CODE, classroom),
    };
}

/**
 * Build a student snapshot for the class payload.
 *
 * @param {Object} student - student.
 * @returns {Object}
 */
function getClassStudentSnapshot(student) {
    return {
        id: student.id,
        displayName: student.displayName,
        activeClass: student.activeClass,
        roles: { global: student.roles?.global || [], class: student.roles?.class || [] },
        pollRes: student.pollRes,
        help: student.help,
        break: student.break,
        isOffline: student.isOffline,
        pogMeter: student.pogMeter,
        isGuest: student.isGuest,
    };
}

/**
 * Emits an event to sockets based on user scopes
 * @param {string} event - The event to emit
 * @param {string} classId - The id of the class
 * @param {{scope?: string, scopes?: string[], api?: boolean, email?: string}} options - The options object
 * @param {...any} data - Additional data to emit with the event
 * @returns {Promise<void>}
 */
async function advancedEmitToClass(event, classId, options, ...data) {
    const classData = classStateStore.getClassroom(classId);
    if (!classData) return;
    const sockets = await io.in(`class-${classId}`).fetchSockets();

    for (const socket of sockets) {
        const user = classData.students[socket.request.session.email];
        let hasAPI = false;
        if (!user) continue;

        if (options.scope && !userHasScope(user, options.scope, classData)) continue;
        if (options.scopes && !options.scopes.every((s) => userHasScope(user, s, classData))) continue;
        if (options.email && user.email != options.email) continue;

        for (let room of socket.rooms) {
            if (room.startsWith("api-")) {
                hasAPI = true;
                break;
            }
        }

        if (options.api == true && !hasAPI) continue;
        if (options.api == false && hasAPI) continue;

        socket.emit(event, ...data);
    }
}

/**
 * Remove a socket from all class rooms to avoid stale class subscriptions.
 * @param {import("socket.io").Socket} socket - socket.
 * @returns {void}
 */
function leaveAllClassRooms(socket) {
    if (!socket || !socket.rooms) {
        return;
    }

    for (const room of socket.rooms) {
        if (room.startsWith("class-")) {
            socket.leave(room);
        }
    }
}

/**
 * Sets the class id for all sockets in a specific API.
 * If no class id is provided, then the class id will be set to null.
 *
 * @param {string} api - The API identifier.
 * @param {string} [classId=null] - The class code to set.
 * @param {number|string|null} classId - Class ID.
 * @returns {Promise<void>}
 */
async function setClassOfApiSockets(api, classId) {
    try {
        if (!api) {
            return;
        }

        const sockets = await io.in(`api-${api}`).fetchSockets();
        for (let socket of sockets) {
            // Ensure the socket has a session before continuing
            if (!socket.request.session) continue;

            leaveAllClassRooms(socket);
            socket.request.session.classId = classId;
            socket.request.session.save();

            // Emit the setClass event to the socket
            if (classId) {
                socket.join(`class-${classId}`);
            }
            socket.emit("setClass", classId);
        }
    } catch (err) {
        // Error handled
    }
}

/**
 * Sets the class id for all sockets belonging to a specific user.
 * This is used when a user joins a class via HTTP to ensure their sockets receive class updates.
 * If no class id is provided, then the class id will be set to null.
 *
 * @param {string} email - The user's email identifier.
 * @param {string} [classId=null] - The class id to set.
 * @param {number|string|null} classId - Class ID.
 * @returns {Promise<void>}
 */
async function setClassOfUserSockets(email, classId) {
    try {
        // Check if user has any sockets
        if (!socketStateStore.hasUserSockets(email)) {
            return;
        }

        // Update all sockets for this user
        for (let socket of Object.values(socketStateStore.getUserSocketsByEmail(email))) {
            // Ensure the socket has a session before continuing
            if (!socket.request.session) continue;

            // Leave all class rooms to prevent stale cross-class subscriptions.
            leaveAllClassRooms(socket);

            // Update session with new class id
            socket.request.session.classId = classId;
            socket.request.session.save();

            // Join the new class room
            if (classId) {
                socket.join(`class-${classId}`);
            }

            // Emit the setClass event to the socket
            socket.emit("setClass", classId);
        }
    } catch (err) {}
}

/**
 * Broadcast manager dashboard updates.
 * @returns {Promise<void>}
 */
async function managerUpdate() {
    try {
        const { users, classrooms } = await getManagerData();

        // Emit only to connected manager sockets
        for (const [email, sockets] of Object.entries(socketStateStore.getUserSockets())) {
            if (getGlobalPermissionLevelForUser(classStateStore.getUser(email) || {}) >= MANAGER_PERMISSIONS) {
                for (const socket of Object.values(sockets)) {
                    socket.emit("managerUpdate", users, classrooms);
                }
            }
        }
    } catch (err) {
        // Error handled
    }
}

/**
 * Sorts students into either included or excluded from the poll.
 * @returns {Object} An object containing two arrays: included and excluded students.
 */
function sortStudentsInPoll(classData) {
    const totalStudentsIncluded = [];
    const totalStudentsExcluded = [];
    for (const student of Object.values(classData.students)) {
        const accessProfile = getClassAccessProfile(student, classData);
        // Store whether the student is included or excluded
        let included = false;
        let excluded = false;

        // Check if the student's checkbox was checked (excludedRespondents stores student ids)
        if (classData.poll.excludedRespondents.includes(student.id)) {
            excluded = true;
        } else {
            included = true;
        }

        // Check exclusion based on class settings for permission levels
        if (classData.settings && classData.settings.isExcluded) {
            if (classData.settings.isExcluded.guests && accessProfile.category === "guest") {
                excluded = true;
                included = false;
            }
            if (classData.settings.isExcluded.mods && accessProfile.category === "mod") {
                excluded = true;
                included = false;
            }
            if (classData.settings.isExcluded.teachers && accessProfile.category === "teacher") {
                excluded = true;
                included = false;
            }
        }

        // Check if they should be in the excluded array
        if (student.break === true) {
            excluded = true;
            included = false;
        }

        // Prevent students from being included if they are offline or teacher or higher
        if (student.isOffline || accessProfile.isTeacher || accessProfile.isManager) {
            excluded = true;
            included = false;
        }

        // Update the included and excluded lists
        if (excluded) {
            totalStudentsExcluded.push(student.email);
        }

        if (included) {
            totalStudentsIncluded.push(student.email);
        }
    }

    return {
        totalStudentsIncluded,
        totalStudentsExcluded,
    };
}

/**
 * Build poll response summary data.
 * @param {Object} classData - classData.
 * @returns {Object}
 */
function getPollResponseInformation(classData) {
    let totalResponses = 0;
    let { totalStudentsIncluded, totalStudentsExcluded } = sortStudentsInPoll(classData);

    // Add response counts to each response object in the responses array
    if (classData.poll.responses.length > 0) {
        // Initialize response count to 0 for each response option
        for (const response of classData.poll.responses) {
            response.responses = 0;
        }

        // Count responses from non-excluded students
        for (const studentData of Object.values(classData.students)) {
            if (studentData.break === true || totalStudentsExcluded.includes(studentData.email)) {
                continue;
            }

            const buttonRes = studentData.pollRes?.buttonRes;

            // Count student as responded if they have any valid response and aren't excluded
            if (Array.isArray(buttonRes)) {
                if (buttonRes.length > 0) {
                    totalResponses++;
                }
            } else if (buttonRes && buttonRes !== "") {
                totalResponses++;
            }

            // Add to the count for each response option
            if (Array.isArray(buttonRes)) {
                for (let res of buttonRes) {
                    const responseObj = classData.poll.responses.find((r) => r.answer === res);
                    if (responseObj) {
                        responseObj.responses++;
                    }
                }
            } else if (buttonRes) {
                const responseObj = classData.poll.responses.find((r) => r.answer === buttonRes);
                if (responseObj) {
                    responseObj.responses++;
                }
            }
        }
    }

    return {
        totalResponses,
        totalResponders: totalStudentsIncluded.length,
    };
}

/**
 * Build a poll snapshot with response counts populated.
 * @param {Object} classData - classData.
 * @returns {Object|undefined}
 */
function buildClassPollData(classData) {
    if (!classData?.poll) {
        return classData?.poll;
    }

    const classDataClone = structuredClone(classData);
    const { totalResponses, totalResponders } = getPollResponseInformation(classDataClone);

    classDataClone.poll.totalResponses = totalResponses;
    classDataClone.poll.totalResponders = totalResponders;

    return classDataClone.poll;
}

/**
 * Build the class update payload.
 * @param {Object} classData - classData.
 * @param {Object} access - access.
 * @param {Object} options - options.
 * @returns {Object}
 */
function getClassUpdateData(classData, access, options = { studentEmail: null }) {
    const viewerStudent = options.studentEmail ? classData.students[options.studentEmail] : null;
    const poll = {
        ...classData.poll,
    };

    if (access.canReadPoll) {
        const { totalResponses, totalResponders } = getPollResponseInformation(classData);
        poll.totalResponses = totalResponses;
        poll.totalResponders = totalResponders;
    } else {
        delete poll.totalResponses;
        delete poll.totalResponders;
    }

    const studentEntries = access.canReadStudents ? Object.entries(classData.students) : viewerStudent ? [[options.studentEmail, viewerStudent]] : [];

    const pollData = access.canReadPoll ? poll : undefined;
    if (pollData) {
        pollData.responses = pollData.responses.map((response) => {
            return {
                ...response,
                isCorrect: access.canReadCorrectPollAnswers ? response.isCorrect : undefined,
            };
        });
    }

    const result = {
        id: classData.id,
        className: classData.className,
        isActive: classData.isActive,
        owner: classData.owner,
        timer: access.canReadTimer ? classData.timer : undefined,
        poll: pollData,
        key: access.canReadKey ? classData.key : undefined,
        settings: access.canReadSettings ? classData.settings : undefined,
        roles: access.canReadRoles ? classData.availableRoles || [] : undefined,
        students: access.canReadStudents
            ? Object.fromEntries(studentEntries.map(([email, student]) => [student.id, getClassStudentSnapshot(student)]))
            : undefined,
    };

    // If studentEmail is provided, include personalized data for that student
    if (viewerStudent) {
        const student = viewerStudent;
    }

    return result;
}

class SocketUpdates {
    constructor(socket) {
        this.socket = socket;
    }

    /**
     * Rebuild and broadcast the current class snapshot so every client stays in sync.
     *
     * @param {*} classId - classId.
     * @param {*} options - options.
     * @returns {*}
     */
    classUpdate(classId = this.socket.request.session.classId, options = { global: true, restrictToControlPanel: false }) {
        try {
            const classroom = classStateStore.getClassroom(classId);
            const classData = structuredClone(classroom);
            if (!classData) {
                return; // If the class is not loaded, then we cannot send a class update
            }

            const sessionEmail = this.socket.request.session?.email;
            const viewerStudent = sessionEmail ? classData.students[sessionEmail] : null;
            const viewerAccess = getClassUpdateAccess(viewerStudent, classroom, options.restrictToControlPanel);

            if (options.global) {
                const controlPanelData = structuredClone(getClassUpdateData(classData, getClassUpdateAccess(viewerStudent, classroom, true)));

                // Send personalized data to each student with their own tags
                // This ensures students can see if they have the "Excluded" tag without exposing other students' data
                for (const [email, student] of Object.entries(classData.students)) {
                    if (hasControlPanelAccess(student, classroom)) continue; // Skip control panel users, they get controlPanelData

                    const personalizedData = structuredClone(
                        getClassUpdateData(classData, getClassUpdateAccess(student, classroom), { studentEmail: email })
                    );
                    advancedEmitToClass("classUpdate", classId, { email: email }, personalizedData);
                }

                advancedEmitToClass("classUpdate", classId, { scopes: CONTROL_PANEL_SCOPES }, controlPanelData);
                this.customPollUpdate();
            } else {
                if (viewerStudent && !viewerAccess.hasControlPanel && !options.restrictToControlPanel) {
                    // If the user requesting class information is a student, send them personalized data
                    const personalizedData = getClassUpdateData(classData, viewerAccess, { studentEmail: sessionEmail });
                    this.socket.emit("classUpdate", personalizedData);
                } else if (options.restrictToControlPanel || viewerAccess.hasControlPanel) {
                    // If it's restricted to the control panel, then only send it to people with control panel access
                    const classReturnData = getClassUpdateData(classData, getClassUpdateAccess(viewerStudent, classroom, true));
                    advancedEmitToClass("classUpdate", classId, { scopes: CONTROL_PANEL_SCOPES }, classReturnData);
                } else {
                    // For guests and other non-teachers, send personalized data only to this socket
                    const personalizedData = getClassUpdateData(classData, viewerAccess, { studentEmail: sessionEmail });
                    this.socket.emit("classUpdate", personalizedData);
                }
                this.customPollUpdate();
            }
        } catch (err) {
            // Error handled
        }
    }

    /**
     * Refresh the polls a user can access after class membership or sharing changes.
     *
     * @param {*} email - email.
     * @param {import("socket.io").Socket} socket - socket.
     * @returns {Promise<*>}
     */
    async customPollUpdate(email, socket = this.socket) {
        try {
            // Ignore any requests which do not have an associated socket with the email
            if (!email && socket.request.session) email = socket.request.session.email;
            if (!classStateStore.getUser(email)) return;

            const user = classStateStore.getUser(email);
            const classId = user.activeClass;
            if (!classStateStore.getClassroom(classId)) return;

            const student = classStateStore.getClassroom(classId).students[email];
            if (!student) return; // If the student is not in the class, then do not update the custom polls

            const userSharedPolls = student.sharedPolls;
            const userOwnedPolls = student.ownedPolls;
            const userCustomPolls = Array.from(new Set(userSharedPolls.concat(userOwnedPolls)));
            const classroomPolls = await getClassPollIds(classId);
            const publicPolls = [];
            const customPollIds = userCustomPolls.concat(classroomPolls);

            database.all(
                `SELECT * FROM custom_polls WHERE id IN(${customPollIds.map(() => "?").join(", ")}) OR public = 1 OR owner=?`,
                [...customPollIds, user.id],
                (err, customPollsData) => {
                    try {
                        if (err) throw err;

                        for (let customPoll of customPollsData) {
                            customPoll.answers = JSON.parse(customPoll.answers);
                            // Convert SQLite integer booleans to actual booleans
                            customPoll.textRes = !!customPoll.textRes;
                            customPoll.blind = !!customPoll.blind;
                            customPoll.allowVoteChanges = !!customPoll.allowVoteChanges;
                            customPoll.allowMultipleResponses = !!customPoll.allowMultipleResponses;
                            customPoll.public = !!customPoll.public;
                        }

                        customPollsData = customPollsData.reduce((newObject, customPoll) => {
                            try {
                                newObject[customPoll.id] = customPoll;
                                return newObject;
                            } catch (err) {
                                // Error handled
                            }
                        }, {});

                        for (let customPoll of Object.values(customPollsData)) {
                            if (customPoll.public) {
                                publicPolls.push(customPoll.id);
                            }
                        }

                        io.to(`user-${email}`).emit("customPollUpdate", publicPolls, classroomPolls, userCustomPolls, customPollsData);
                        const apiId = this.socket && this.socket.request && this.socket.request.session && this.socket.request.session.api;
                        if (apiId) {
                            io.to(`api-${apiId}`).emit("customPollUpdate", publicPolls, classroomPolls, userCustomPolls, customPollsData);
                        }
                    } catch (err) {
                        // Error handled
                    }
                }
            );
        } catch (err) {
            // Error handled
        }
    }

    /**
     * Clear cached poll IDs so the next class update reloads fresh membership data.
     *
     * @param {*} classId - classId.
     * @returns {*}
     */
    invalidateClassPollCache(classId) {
        invalidateClassPollCache(classId);
    }

    /**
     * Broadcast the current banned-user list so moderation views stay accurate.
     *
     * @param {*} classId - classId.
     * @returns {*}
     */
    classBannedUsersUpdate(classId = this.socket.request.session.classId) {
        try {
            if (!classId) return;
            dbGetAll(
                "SELECT users.id, roles.scopes FROM user_roles JOIN roles ON roles.id = user_roles.roleId JOIN users ON users.id = user_roles.userId WHERE user_roles.classId = ?",
                [classId]
            )
                .then((rows) => {
                    const bannedStudents = rows
                        .filter((row) => parseScopesField(row.scopes).includes(SCOPES.CLASS.SYSTEM.BLOCKED))
                        .map((row) => row.id);

                    advancedEmitToClass("classBannedUsersUpdate", classId, { scope: SCOPES.CLASS.STUDENTS.BAN }, bannedStudents);
                })
                .catch(() => {});
        } catch (err) {
            // Error handled
        }
    }

    /**
     * Emit the classes a user owns so ownership-dependent UI can refresh.
     *
     * @param {*} email - email.
     * @returns {Promise<*>}
     */
    async getOwnedClasses(email) {
        try {
            // Check if the user exists before accessing .id
            const user = classStateStore.getUser(email);
            if (!user || !user.id) {
                return;
            }

            // Get the user's owned classes from the database
            const ownedClasses = await dbGetAll("SELECT name, id FROM classroom WHERE owner=?", [user.id]);

            // Send the owned classes to the user's sockets
            io.to(`user-${email}`).emit("getOwnedClasses", ownedClasses);

            // Only emit to API-specific room if the API session property exists
            const session = this.socket.request && this.socket.request.session;
            if (session && session.api) {
                io.to(`api-${session.api}`).emit("getOwnedClasses", ownedClasses);
            }
        } catch (err) {
            // Error handled
        }
    }

    /**
     * Emit the users and classes sharing a poll so share dialogs stay current.
     *
     * @param {*} pollId - pollId.
     * @returns {*}
     */
    getPollShareIds(pollId) {
        try {
            database.all(
                "SELECT pollId, userId FROM shared_polls LEFT JOIN users ON users.id = shared_polls.userId WHERE pollId=?",
                pollId,
                (err, userPollShares) => {
                    try {
                        if (err) throw err;

                        database.all(
                            "SELECT pollId, classId, name FROM class_polls LEFT JOIN classroom ON classroom.id = class_polls.classId WHERE pollId=?",
                            pollId,
                            (err, classPollShares) => {
                                try {
                                    if (err) throw err;

                                    this.socket.emit("getPollShareIds", userPollShares, classPollShares);
                                } catch (err) {
                                    // Error handled
                                }
                            }
                        );
                    } catch (err) {}
                }
            );
        } catch (err) {
            // Error handled
        }
    }
}

module.exports = {
    // Socket information
    socketStateStore,
    runningTimers,
    rateLimits,
    userSockets,
    PASSIVE_SOCKETS,
    invalidateClassPollCache,
    buildClassPollData,

    // Socket functions
    emitToUser,
    advancedEmitToClass,
    setClassOfApiSockets,
    setClassOfUserSockets,
    managerUpdate,
    userUpdateSocket,
    SocketUpdates,
};
