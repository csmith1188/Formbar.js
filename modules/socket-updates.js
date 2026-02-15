const { classInformation } = require("./class/classroom");
const { database, dbGetAll } = require("./database");
const { TEACHER_PERMISSIONS, CLASS_SOCKET_PERMISSIONS, GUEST_PERMISSIONS, MANAGER_PERMISSIONS, MOD_PERMISSIONS } = require("./permissions");
const { getManagerData } = require("@services/manager-service");
const { io } = require("./web-server");

const runningTimers = {};
const rateLimits = {};
const userSockets = {};

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

async function emitToUser(email, event, ...data) {
    for (const socket of Object.values(userSockets[email])) {
        socket.emit(event, ...data);
    }
}

/**
 * Calls a SocketUpdates method on all sockets for a user
 * @param {string} email - The user's email
 * @param {string} methodName - The name of the SocketUpdates method to call (e.g., 'classUpdate', 'customPollUpdate')
 * @param {...any} args - Arguments to pass to the method
 */
async function userUpdateSocket(email, methodName, ...args) {
    // Dynamically load to prevent circular dependency error
    const { userSocketUpdates } = require("../sockets/init");

    // If user has no socket connections yet, then return
    const userSockets = userSocketUpdates.get(email);
    if (!userSockets || userSockets.size === 0) {
        return;
    }

    for (const socketUpdates of userSockets.values()) {
        if (socketUpdates && typeof socketUpdates[methodName] === "function") {
            socketUpdates[methodName](...args);
        }
    }
}

/**
 * Emits an event to sockets based on user permissions
 * @param {string} event - The event to emit
 * @param {string} classId - The id of the class
 * @param {{permissions?: number, classPermissions?: number, maxClassPermissions?: number, api?: boolean, email?: string}} options - The options object
 * @param  {...any} data - Additional data to emit with the event
 */
async function advancedEmitToClass(event, classId, options, ...data) {
    const classData = classInformation.classrooms[classId];
    const sockets = await io.in(`class-${classId}`).fetchSockets();

    for (const socket of sockets) {
        const user = classData.students[socket.request.session.email];
        let hasAPI = false;
        if (!user) continue;

        if (options.permissions && user.permissions < options.permissions) continue;
        if (options.classPermissions && user.classPermissions < options.classPermissions) continue;
        if (options.maxClassPermissions && user.classPermissions > options.maxClassPermissions) continue;
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
 * Sets the class id for all sockets in a specific API.
 * If no class id is provided, then the class id will be set to null.
 *
 * @param {string} api - The API identifier.
 * @param {string} [classId=null] - The class code to set.
 */
async function setClassOfApiSockets(api, classId) {
    try {
        const sockets = await io.in(`api-${api}`).fetchSockets();
        for (let socket of sockets) {
            // Ensure the socket has a session before continuing
            if (!socket.request.session) continue;

            socket.leave(`class-${socket.request.session.classId}`);
            socket.request.session.classId = classId;
            socket.request.session.save();

            // Emit the setClass event to the socket
            socket.join(`class-${classId}`);
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
 */
async function setClassOfUserSockets(email, classId) {
    try {
        // Check if user has any sockets
        if (!userSockets[email]) {
            return;
        }

        // Update all sockets for this user
        for (let socket of Object.values(userSockets[email])) {
            // Ensure the socket has a session before continuing
            if (!socket.request.session) continue;

            // Leave the old class room
            const oldClassId = socket.request.session.classId;
            if (oldClassId) {
                socket.leave(`class-${oldClassId}`);
            }

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

async function managerUpdate() {
    try {
        const { users, classrooms } = await getManagerData();

        // Emit only to connected manager sockets
        for (const [email, sockets] of Object.entries(userSockets)) {
            if (classInformation.users[email].permissions >= MANAGER_PERMISSIONS) {
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
        // Store whether the student is included or excluded
        let included = false;
        let excluded = false;

        // Check if the student's checkbox was checked (excludedRespondents stores student ids)
        if (classData.poll.excludedRespondents.includes(student.id)) {
            excluded = true;
        } else {
            included = true;
        }

        // Check if they have the Excluded tag
        if (student.tags && student.tags.includes("Excluded")) {
            excluded = true;
            included = false;
        }

        // Check exclusion based on class settings for permission levels
        if (classData.settings && classData.settings.isExcluded) {
            if (classData.settings.isExcluded.guests && student.permissions == GUEST_PERMISSIONS) {
                excluded = true;
                included = false;
            }
            if (classData.settings.isExcluded.mods && student.classPermissions == MOD_PERMISSIONS) {
                excluded = true;
                included = false;
            }
            if (classData.settings.isExcluded.teachers && student.classPermissions == TEACHER_PERMISSIONS) {
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
        if ((student.tags && student.tags.includes("Offline")) || student.classPermissions >= TEACHER_PERMISSIONS) {
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

            // Count student as responded if they have any valid response and aren't excluded
            if (Array.isArray(studentData.pollRes.buttonRes)) {
                if (studentData.pollRes.buttonRes.length > 0) {
                    totalResponses++;
                }
            } else if (studentData.pollRes.buttonRes && studentData.pollRes.buttonRes !== "") {
                totalResponses++;
            }

            // Add to the count for each response option
            if (Array.isArray(studentData.pollRes.buttonRes)) {
                for (let res of studentData.pollRes.buttonRes) {
                    const responseObj = classData.poll.responses.find((r) => r.answer === res);
                    if (responseObj) {
                        responseObj.responses++;
                    }
                }
            } else if (studentData.pollRes.buttonRes) {
                const responseObj = classData.poll.responses.find((r) => r.answer === studentData.pollRes.buttonRes);
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

function getClassUpdateData(classData, hasTeacherPermissions, options = { restrictToControlPanel: false, studentEmail: null }) {
    const result = {
        id: classData.id,
        className: classData.className,
        isActive: classData.isActive,
        owner: classData.owner,
        timer: classData.timer,
        poll: {
            ...classData.poll,
        },
        permissions: hasTeacherPermissions ? classData.permissions : undefined,
        key: hasTeacherPermissions ? classData.key : undefined,
        tags: hasTeacherPermissions ? classData.tags : undefined,
        settings: classData.settings,
        students: hasTeacherPermissions
            ? Object.fromEntries(
                  Object.entries(classData.students).map(([email, student]) => [
                      student.id,
                      {
                          id: student.id,
                          displayName: student.displayName,
                          activeClass: student.activeClass,
                          permissions: student.permissions,
                          classPermissions: student.classPermissions,
                          tags: student.tags,
                          pollRes: student.pollRes,
                          help: student.help,
                          break: student.break,
                          pogMeter: student.pogMeter,
                          isGuest: student.isGuest,
                      },
                  ])
              )
            : undefined,
    };

    // If studentEmail is provided, include personalized data for that student
    // This allows students to see their own tags without exposing other students' tags
    if (options.studentEmail && classData.students[options.studentEmail]) {
        const student = classData.students[options.studentEmail];
        result.myTags = student.tags || [];
        result.myId = student.id;
    }

    return result;
}

class SocketUpdates {
    constructor(socket) {
        this.socket = socket;
    }

    classUpdate(classId = this.socket.request.session.classId, options = { global: true, restrictToControlPanel: false }) {
        try {
            const classData = structuredClone(classInformation.classrooms[classId]);
            if (!classData) {
                return; // If the class is not loaded, then we cannot send a class update
            }

            // Retrieve the permissions that allows a user to access the control panel
            const controlPanelPermissions = Math.min(
                classData.permissions.controlPoll,
                classData.permissions.manageStudents,
                classData.permissions.manageClass
            );

            let userData;
            let hasTeacherPermissions = false;
            if (this.socket.request.session && !options.global) {
                const email = this.socket.request.session.email;
                userData = classData.students[email];
                if (!userData) {
                    return; // If the user is not loaded, then we cannot check if they're a teacher
                }

                if (userData.classPermissions >= controlPanelPermissions) {
                    hasTeacherPermissions = true;
                }
            }

            // If we're only sending this update to people with access to the control panel, then
            // we do not need to restrict their data access.
            if (options.restrictToControlPanel) {
                hasTeacherPermissions = true;
            } else if (options.global) {
                hasTeacherPermissions = false;
            }

            const { totalResponses, totalResponders } = getPollResponseInformation(classData);
            classData.poll.totalResponses = totalResponses;
            classData.poll.totalResponders = totalResponders;

            if (options.global) {
                const controlPanelData = structuredClone(getClassUpdateData(classData, true));

                // Send personalized data to each student with their own tags
                // This ensures students can see if they have the "Excluded" tag without exposing other students' data
                for (const [email, student] of Object.entries(classData.students)) {
                    if (student.classPermissions >= controlPanelPermissions) continue; // Skip teachers, they get controlPanelData

                    const personalizedData = structuredClone(getClassUpdateData(classData, false, { studentEmail: email }));
                    advancedEmitToClass("classUpdate", classId, { email: email }, personalizedData);
                }

                advancedEmitToClass("classUpdate", classId, { classPermissions: controlPanelPermissions }, controlPanelData);
                this.customPollUpdate();
            } else {
                if (userData && userData.classPermissions < TEACHER_PERMISSIONS && !options.restrictToControlPanel) {
                    // If the user requesting class information is a student, send them personalized data
                    const personalizedData = getClassUpdateData(classData, hasTeacherPermissions, { studentEmail: userData.email });
                    this.socket.emit("classUpdate", personalizedData);
                } else if (options.restrictToControlPanel || userData.classPermissions >= controlPanelPermissions) {
                    // If it's restricted to the control panel, then only send it to people with control panel access
                    const classReturnData = getClassUpdateData(classData, hasTeacherPermissions);
                    advancedEmitToClass("classUpdate", classId, { classPermissions: controlPanelPermissions }, classReturnData);
                } else {
                    // For guests and other non-teachers, send personalized data
                    const email = this.socket.request.session?.email;
                    const personalizedData = getClassUpdateData(classData, hasTeacherPermissions, { studentEmail: email });
                    advancedEmitToClass("classUpdate", classId, { classPermissions: GUEST_PERMISSIONS }, personalizedData);
                }
                this.customPollUpdate();
            }
        } catch (err) {
            // Error handled
        }
    }

    customPollUpdate(email, socket = this.socket) {
        try {
            // Ignore any requests which do not have an associated socket with the email
            if (!email && socket.request.session) email = socket.request.session.email;
            if (!classInformation.users[email]) return;

            const user = classInformation.users[email];
            const classId = user.activeClass;
            if (!classInformation.classrooms[classId]) return;

            const student = classInformation.classrooms[classId].students[email];
            if (!student) return; // If the student is not in the class, then do not update the custom polls

            const userSharedPolls = student.sharedPolls;
            const userOwnedPolls = student.ownedPolls;
            const userCustomPolls = Array.from(new Set(userSharedPolls.concat(userOwnedPolls)));
            const classroomPolls = structuredClone(classInformation.classrooms[classId].sharedPolls);
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

    classBannedUsersUpdate(classId = this.socket.request.session.classId) {
        try {
            if (!classId) return;

            database.all(
                "SELECT users.id FROM classroom JOIN classusers ON classusers.classId = classroom.id AND classusers.permissions = 0 JOIN users ON users.id = classusers.studentId WHERE classusers.classId=?",
                classId,
                (err, bannedStudents) => {
                    try {
                        if (err) throw err;
                        bannedStudents = bannedStudents.map((bannedStudent) => bannedStudent.id);

                        advancedEmitToClass(
                            "classBannedUsersUpdate",
                            classId,
                            { classPermissions: classInformation.classrooms[classId].permissions.manageStudents },
                            bannedStudents
                        );
                    } catch (err) {
                        // Error handled
                    }
                }
            );
        } catch (err) {
            // Error handled
        }
    }

    async getOwnedClasses(email) {
        try {
            // Check if the user exists before accessing .id
            if (!classInformation.users[email] || !classInformation.users[email].id) {
                return;
            }

            // Get the user's owned classes from the database
            const ownedClasses = await dbGetAll("SELECT name, id FROM classroom WHERE owner=?", [classInformation.users[email].id]);

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

    timer(sound, active) {
        try {
            let classData = classInformation.classrooms[this.socket.request.session.classId];
            if (classData.timer.timeLeft <= 0) {
                clearInterval(runningTimers[this.socket.request.session.classId]);
                runningTimers[this.socket.request.session.classId] = null;
            }

            if (classData.timer.timeLeft > 0 && active) classData.timer.timeLeft--;
            if (classData.timer.timeLeft <= 0 && active && sound) {
                advancedEmitToClass("timerSound", this.socket.request.session.classId, {});
            }

            advancedEmitToClass(
                "vbTimer",
                this.socket.request.session.classId,
                {
                    classPermissions: CLASS_SOCKET_PERMISSIONS.vbTimer,
                },
                classData.timer
            );
        } catch (err) {
            // Error handled
        }
    }
}

module.exports = {
    // Socket information
    runningTimers,
    rateLimits,
    userSockets,
    PASSIVE_SOCKETS,

    // Socket functions
    emitToUser,
    advancedEmitToClass,
    setClassOfApiSockets,
    setClassOfUserSockets,
    managerUpdate,
    userUpdateSocket,
    SocketUpdates,
};
