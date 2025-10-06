const { whitelistedIps, blacklistedIps } = require("../routes/middleware/authentication");
const { classInformation } = require("./class/classroom");
const { settings } = require("./config");
const { database, dbGetAll, dbRun } = require("./database");
const { logger } = require("./logger");
const { TEACHER_PERMISSIONS, CLASS_SOCKET_PERMISSIONS, GUEST_PERMISSIONS, STUDENT_PERMISSIONS, MANAGER_PERMISSIONS } = require("./permissions");
const { getManagerData } = require("./manager");
const { getEmailFromId } = require("./student");
const { io } = require("./webServer");

const runningTimers = {}
const rateLimits = {}
const userSockets = {}

// These events will not display a permission error if the user does not have permission to use them
const PASSIVE_SOCKETS = [
    'classUpdate',
    'managerUpdate',
    'ipUpdate',
    'customPollUpdate',
    'classBannedUsersUpdate',
    'isClassActive',
    'getCanVote',
    'setClassSetting'
];

async function emitToUser(email, event, ...data) {
    for (const socket of Object.values(userSockets[email])) {
        socket.emit(event, ...data)
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
    const classData = classInformation.classrooms[classId]
    const sockets = await io.in(`class-${classId}`).fetchSockets()

    for (const socket of sockets) {
        const user = classData.students[socket.request.session.email]
        let hasAPI = false
        if (!user) continue

        if (options.permissions && user.permissions < options.permissions) continue
        if (options.classPermissions && user.classPermissions < options.classPermissions) continue
        if (options.maxClassPermissions && user.classPermissions > options.maxClassPermissions) continue
        if (options.email && user.email != options.email) continue

        for (let room of socket.rooms) {
            if (room.startsWith('api-')) {
                hasAPI = true
                break
            }
        }

        if (options.api == true && !hasAPI) continue
        if (options.api == false && hasAPI) continue

        socket.emit(event, ...data)
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
    logger.log('verbose', `[setClassOfApiSockets] api=(${api}) classId=(${classId})`);

    const sockets = await io.in(`api-${api}`).fetchSockets()
    for (let socket of sockets) {
        socket.leave(`class-${socket.request.session.classId}`)

        socket.request.session.classId = classId
        socket.request.session.save()

        // Emit the setClass event to the socket
        socket.join(`class-${classId}`)
        socket.emit('setClass', socket.request.session.classId)
    }
}

async function managerUpdate() {
    try {
        const { users, classrooms } = await getManagerData()

        // Emit only to connected manager sockets
        for (const [email, sockets] of Object.entries(userSockets)) {
            if (classInformation.users[email].permissions >= MANAGER_PERMISSIONS) {
                for (const socket of Object.values(sockets)) {
                    socket.emit('managerUpdate', users, classrooms)
                }
            }
        }
    } catch (err) {
        logger.log('error', err.stack);
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

        // Check if the student passes the tags test
        if (classData.poll.requiredTags.length > 0) {
            let studentTags = student.tags.split(",");
            if (classData.poll.requiredTags[0][0] == "0") {
                if (classData.poll.requiredTags.slice(1).join() == student.tags) {
                    included = true;
                } else {
                    excluded = true;
                }
            } else if (classData.poll.requiredTags[0][0] == "1") {
                let correctTags = classData.poll.requiredTags.slice(1).filter(tag => studentTags.includes(tag)).length;
                if (correctTags == classData.poll.requiredTags.length - 1) {
                    included = true;
                } else {
                    excluded = true;
                }
            }
        }

        // Check if the student's checkbox was checked (studentsAllowedToVote stores student ids)
        if (classData.poll.studentsAllowedToVote.includes(student.id.toString())) {
            included = true;
        } else {
            excluded = true;
        }

        // Check if they are a guest
        if (student.classPermissions == GUEST_PERMISSIONS) {
            excluded = true;
        }

        // Check if they should be in the excluded array
        if (student.break == true) {
            excluded = true;
        }

        // Prevent students from being included if they are offline
        if (student.tags && student.tags.includes('Offline') || student.classPermissions >= TEACHER_PERMISSIONS) {
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
    }
}

function getPollResponseInformation(classData) {
    let totalResponses = 0;
    let responses = {};
    let { totalStudentsIncluded, totalStudentsExcluded } = sortStudentsInPoll(classData);

    // Count the number of responses for each poll option
    if (Object.keys(classData.poll.responses).length > 0) {
        for (const [resKey, resValue] of Object.entries(classData.poll.responses)) {
            responses[resKey] = {
                ...resValue,
                responses: 0
            }
        }

        for (const studentData of Object.values(classData.students)) {
            if (studentData.break == true || totalStudentsExcluded.includes(studentData.email)) {
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

            if (Array.isArray(studentData.pollRes.buttonRes)) {
                for (let response of studentData.pollRes.buttonRes) {
                    if (studentData && Object.keys(responses).includes(response)) {
                        responses[response].responses++;
                    }
                }
            } else if (studentData && Object.keys(responses).includes(studentData.pollRes.buttonRes) && !totalStudentsExcluded.includes(studentData.email)) {
                responses[studentData.pollRes.buttonRes].responses++;
            }
        }
    }

    if (totalResponses == 0) {
        totalStudentsIncluded = Object.keys(classData.students)
        for (let i = totalStudentsIncluded.length - 1; i >= 0; i--) {
            const studentName = totalStudentsIncluded[i];
            const student = classData.students[studentName];
            if (student.classPermissions >= TEACHER_PERMISSIONS || student.classPermissions == GUEST_PERMISSIONS || student.tags && student.tags.includes('Offline')) {
                totalStudentsIncluded.splice(i, 1);
            }
        }
    }

    return {
        totalResponses,
        totalResponders: totalStudentsIncluded.length,
        pollResponses: responses,
    }
}

function getClassUpdateData(classData, hasTeacherPermissions, options = { restrictToControlPanel: false }) {
    // Redact sensitive information if the user does not have teacher permissions
    if (!hasTeacherPermissions && !options.restrictToControlPanel) {
        classData.poll.studentsAllowedToVote = undefined;
    }

    return {
        id: classData.id,
        className: classData.className,
        isActive: classData.isActive,
        timer: classData.timer,
        poll: classData.poll,
        permissions: hasTeacherPermissions ? classData.permissions : undefined,
        key: hasTeacherPermissions ? classData.key : undefined,
        tags: hasTeacherPermissions ? classData.tags : undefined,
        settings: hasTeacherPermissions ? classData.settings : undefined,
        students: hasTeacherPermissions ? Object.fromEntries(
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
                }
            ])
        ) : undefined
    }
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
                classData.permissions.controlPolls,
                classData.permissions.manageStudents,
                classData.permissions.manageClass
            )

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

            const { totalResponses, totalResponders, pollResponses } = getPollResponseInformation(classData);
            classData.poll.totalResponses = totalResponses;
            classData.poll.totalResponders = totalResponders;
            classData.poll.responses = pollResponses;

            if (options.global) {
                const controlPanelData = structuredClone(getClassUpdateData(classData, true));
                const classReturnData = structuredClone(getClassUpdateData(classData, hasTeacherPermissions));
                advancedEmitToClass('classUpdate', classId, { classPermissions: controlPanelPermissions }, controlPanelData)
                advancedEmitToClass('classUpdate', classId, { classPermissions: GUEST_PERMISSIONS, maxClassPermissions: STUDENT_PERMISSIONS }, classReturnData)
                this.customPollUpdate();
            } else {
                const classReturnData = getClassUpdateData(classData, hasTeacherPermissions);
                if (userData && userData.classPermissions < TEACHER_PERMISSIONS && !options.restrictToControlPanel) {
                    // If the user requesting class information is a student, then only send them the information
                    io.to(`user-${userData.email}`).emit('classUpdate', classReturnData);
                } else if (options.restrictToControlPanel) {
                    // If it's restricted to the control panel, then only send it to people with control panel access
                    advancedEmitToClass('classUpdate', classId, { classPermissions: controlPanelPermissions }, classReturnData)
                } else {
                    advancedEmitToClass('classUpdate', classId, { classPermissions: GUEST_PERMISSIONS }, classReturnData)
                }
                this.customPollUpdate();
            }
        } catch (err) {
            logger.log('error', err.stack);
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

            logger.log('info', `[customPollUpdate] email=(${email})`)
            const userSharedPolls = student.sharedPolls
            const userOwnedPolls = student.ownedPolls
            const userCustomPolls = Array.from(new Set(userSharedPolls.concat(userOwnedPolls)))
            const classroomPolls = structuredClone(classInformation.classrooms[classId].sharedPolls)
            const publicPolls = []
            const customPollIds = userCustomPolls.concat(classroomPolls)

            logger.log('verbose', `[customPollUpdate] userSharedPolls=(${userSharedPolls}) userOwnedPolls=(${userOwnedPolls}) userCustomPolls=(${userCustomPolls}) classroomPolls=(${classroomPolls}) publicPolls=(${publicPolls}) customPollIds=(${customPollIds})`)

            database.all(
                `SELECT * FROM custom_polls WHERE id IN(${customPollIds.map(() => '?').join(', ')}) OR public = 1 OR owner=?`,
                [
                    ...customPollIds,
                    user.id
                ],
                (err, customPollsData) => {
                    try {
                        if (err) throw err

                        for (let customPoll of customPollsData) {
                            customPoll.answers = JSON.parse(customPoll.answers)
                        }

                        customPollsData = customPollsData.reduce((newObject, customPoll) => {
                            try {
                                newObject[customPoll.id] = customPoll
                                return newObject
                            } catch (err) {
                                logger.log('error', err.stack);
                            }
                        }, {})

                        for (let customPoll of Object.values(customPollsData)) {
                            if (customPoll.public) {
                                publicPolls.push(customPoll.id)
                            }
                        }

                        logger.log('verbose', `[customPollUpdate] publicPolls=(${publicPolls}) classroomPolls=(${classroomPolls}) userCustomPolls=(${userCustomPolls}) customPollsData=(${JSON.stringify(customPollsData)})`)

                        io.to(`user-${email}`).emit(
                            'customPollUpdate',
                            publicPolls,
                            classroomPolls,
                            userCustomPolls,
                            customPollsData
                        )
                    } catch (err) {
                        logger.log('error', err.stack);
                    }
                }
            )
        } catch (err) {
            logger.log('error', err.stack);
        }
    }

    classBannedUsersUpdate(classId = this.socket.request.session.classId) {
        try {
            logger.log('info', `[classBannedUsersUpdate] ip=(${this.socket.handshake.address}) session=(${JSON.stringify(this.socket.request.session)})`);
            logger.log('info', `[classBannedUsersUpdate] classId=(${classId})`);
            if (!classId) return;

            database.all('SELECT users.id FROM classroom JOIN classusers ON classusers.classId = classroom.id AND classusers.permissions = 0 JOIN users ON users.id = classusers.studentId WHERE classusers.classId=?', classId, (err, bannedStudents) => {
                try {
                    if (err) throw err
                    bannedStudents = bannedStudents.map((bannedStudent) => bannedStudent.id)

                    advancedEmitToClass(
                        'classBannedUsersUpdate',
                        classId,
                        { classPermissions: classInformation.classrooms[classId].permissions.manageStudents },
                        bannedStudents
                    )
                } catch (err) {
                    logger.log('error', err.stack)
                }
            })
        } catch (err) {
            logger.log('error', err.stack)
        }
    }

    // Kicks a user from a class
    // If exitClass is set to true, then it will fully remove the user from the class;
    // Otherwise, it will just remove the user from the class session while keeping them registered to the classroom.
    async classKickUser(userId, classId = this.socket.request.session.classId, exitClass = true) {
        try {
            const email = await getEmailFromId(userId);
            logger.log('info', `[classKickUser] email=(${email}) classId=(${classId}) exitClass=${exitClass}`);

            // Check if user exists in classInformation.users before trying to modify
            if (classInformation.users[email]) {
                // Remove user from class session
                classInformation.users[email].classPermissions = null;
                classInformation.users[email].activeClass = null;
                setClassOfApiSockets(classInformation.users[email].API, null);
            }

            // Mark the user as offline in the class and remove them from the active classes if the classroom is loaded into memory
            if (classInformation.classrooms[classId] && classInformation.classrooms[classId].students[email]) {
                const student = classInformation.classrooms[classId].students[email];
                student.activeClass = null;
                student.tags = ['Offline'];
                if (classInformation.users[email]) {
                    classInformation.users[email] = student;
                }

                // If the student is a guest, then remove them from the classroom entirely
                if (student.isGuest) {
                    delete classInformation.classrooms[classId].students[email];
                }
            }

            // If exitClass is true, then remove the user from the classroom entirely
            // If the user is a guest, then do not try to remove them from the database
            if (exitClass && classInformation.classrooms[classId]) {
                if (classInformation.users[email] && !classInformation.users[email].isGuest) {
                    await dbRun('DELETE FROM classusers WHERE studentId=? AND classId=?', [classInformation.users[email].id, classId]);
                }
                delete classInformation.classrooms[classId].students[email];
            }

            // Update the control panel
            this.classUpdate(classId);

            // If the user is logged in, then handle the user's session
            if (userSockets[email]) {
                for (const userSocket of Object.values(userSockets[email])) {
                    userSocket.leave(`class-${classId}`);
                    userSocket.request.session.classId = null;
                    userSocket.request.session.save();
                    userSocket.emit('reload');
                }
            }
        } catch (err) {
            logger.log('error', err.stack);
        }
    }

    classKickStudents(classId) {
        try {
            logger.log('info', `[classKickStudents] classId=(${classId})`)

            for (const student of Object.values(classInformation.classrooms[classId].students)) {
                if (student.classPermissions < TEACHER_PERMISSIONS) {
                    this.classKickUser(student.id, classId);
                }
            }
        } catch (err) {
            logger.log('error', err.stack);
        }
    }

    getOwnedClasses(email) {
        try {
            logger.log('info', `[getOwnedClasses] email=(${email})`)

            database.all('SELECT name, id FROM classroom WHERE owner=?',
                [classInformation.users[email].id], (err, ownedClasses) => {
                    try {
                        if (err) throw err

                        logger.log('info', `[getOwnedClasses] ownedClasses=(${JSON.stringify(ownedClasses)})`)

                        io.to(`user-${email}`).emit('getOwnedClasses', ownedClasses)
                    } catch (err) {
                        logger.log('error', err.stack);
                    }
                }
            )
        } catch (err) {
            logger.log('error', err.stack);
        }
    }

    getPollShareIds(pollId) {
        try {
            logger.log('info', `[getPollShareIds] pollId=(${pollId})`)

            database.all(
                'SELECT pollId, userId FROM shared_polls LEFT JOIN users ON users.id = shared_polls.userId WHERE pollId=?',
                pollId,
                (err, userPollShares) => {
                    try {
                        if (err) throw err

                        database.all(
                            'SELECT pollId, classId, name FROM class_polls LEFT JOIN classroom ON classroom.id = class_polls.classId WHERE pollId=?',
                            pollId,
                            (err, classPollShares) => {
                                try {
                                    if (err) throw err

                                    logger.log('info', `[getPollShareIds] userPollShares=(${JSON.stringify(userPollShares)}) classPollShares=(${JSON.stringify(classPollShares)})`)

                                    this.socket.emit('getPollShareIds', userPollShares, classPollShares)
                                } catch (err) {
                                    logger.log('error', err.stack);
                                }
                            }
                        )
                    } catch (err) { }
                }
            )
        } catch (err) {
            logger.log('error', err.stack);
        }
    }

    ipUpdate(type, email) {
        try {
            logger.log('info', `[ipUpdate] email=(${email})`)

            let ipList = {}
            if (type == 'whitelist') {
                ipList = whitelistedIps
            } else if (type == 'blacklist') {
                ipList = blacklistedIps
            }

            if (type) {
                if (email) io.to(`user-${email}`).emit('ipUpdate', type, settings[`${type}Active`], ipList)
                else io.emit('ipUpdate', type, settings[`${type}Active`], ipList)
            } else {
                this.ipUpdate('whitelist', email)
                this.ipUpdate('blacklist', email)
            }
        } catch (err) {
            logger.log('error', err.stack);
        }
    }

    async reloadPageByIp(include, ip) {
        for (let userSocket of await io.fetchSockets()) {
            let userIp = userSocket.handshake.address

            if (userIp.startsWith('::ffff:')) userIp = userIp.slice(7)
            if ((include && userIp.startsWith(ip)) || (!include && !userIp.startsWith(ip))) {
                user.socket.emit('reload')
            }
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
                advancedEmitToClass('timerSound', this.socket.request.session.classId, {});
            }

            advancedEmitToClass('vbTimer', this.socket.request.session.classId, {
                classPermissions: CLASS_SOCKET_PERMISSIONS.vbTimer
            }, classData.timer);
        } catch (err) {
            logger.log('error', err.stack);
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
    managerUpdate,
    SocketUpdates
};
