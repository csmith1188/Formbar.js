// @TODO: Organize all of this

const { settings } = require("./config");
const { database } = require("./database");
const { logger } = require("./logger");
const { io } = require("./webServer");

const runningTimers = {};
const rateLimits = {}
const userSockets = {}

function classPermissionUpdate(classCode = socket.request.session.class) {
    try {
        logger.log('info', `[classPermissionUpdate] classCode=(${classCode})`)

        let classData = classInformation[classCode]
        let cpPermissions = Math.min(
            classData.permissions.controlPolls,
            classData.permissions.manageStudents,
            classData.permissions.manageClass
        )

        advancedEmitToClass('cpUpdate', classCode, { classPermissions: cpPermissions }, classData)
    } catch (err) {
        logger.log('error', err.stack);
    }
}

function virtualBarUpdate(classCode = socket.request.session.class) {
    try {
        logger.log('info', `[virtualBarUpdate] classCode=(${classCode})`)

        if (!classCode) return
        if (classCode == 'noClass') return

        let classData = structuredClone(classInformation[classCode])
        let responses = {}

        // for (let [username, student] of Object.entries(classData.students)) {
        // 	if (
        // 		student.break == true ||
        // 		student.classPermissions <= STUDENT_PERMISSIONS ||
        // 		student.classPermissions >= TEACHER_PERMISSIONS
        // 	) delete classData.students[username]
        // }

        if (Object.keys(classData.poll.responses).length > 0) {
            for (let [resKey, resValue] of Object.entries(classData.poll.responses)) {
                responses[resKey] = {
                    ...resValue,
                    responses: 0
                }
            }

            for (let studentData of Object.values(classData.students)) {
                if (Array.isArray(studentData.pollRes.buttonRes)) {
                    for (let response of studentData.pollRes.buttonRes) {
                        if (
                            studentData &&
                            Object.keys(responses).includes(response)
                        ) {
                            responses[response].responses++
                        }
                    }

                } else if (
                    studentData &&
                    Object.keys(responses).includes(studentData.pollRes.buttonRes)
                ) {
                    responses[studentData.pollRes.buttonRes].responses++
                }
            }
        }

        logger.log('verbose', `[virtualBarUpdate] status=(${classData.poll.status}) totalResponses=(${Object.keys(classData.students).length}) polls=(${JSON.stringify(responses)}) textRes=(${classData.poll.textRes}) prompt=(${classData.poll.prompt}) weight=(${classData.poll.weight}) blind=(${classData.poll.blind})`)

        let totalResponses = 0;
        let totalResponders = 0
        let totalStudentsIncluded = []
        let totalStudentsExcluded = []
        let totalLastResponses = classData.poll.lastResponse

        // Add to the included array, then add to the excluded array, then remove from the included array. Do not add the same student to either array
        if (totalLastResponses.length > 0) {
            totalResponses = totalLastResponses.length
            totalStudentsIncluded = totalLastResponses
        } else {
            for (let student of Object.values(classData.students)) {
                if (student.classPermissions >= TEACHER_PERMISSIONS || student.classPermissions == GUEST_PERMISSIONS) continue;
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

                // Check if the student's checkbox was checked
                if (classData.poll.studentBoxes.includes(student.username)) {
                    included = true;
                } else if (classData.poll.studentBoxes.length > 0) {
                    excluded = true;
                }

                // Check if they should be in the excluded array
                if (student.break) {
                    excluded = true;
                }

                if (classData.poll.studentIndeterminate.includes(student.username)) {
                    excluded = true;
                }

                // Update the included and excluded lists
                if (excluded) totalStudentsExcluded.push(student.username);
                if (included) totalStudentsIncluded.push(student.username);
            }
            totalStudentsIncluded = new Set(totalStudentsIncluded)
            totalStudentsIncluded = Array.from(totalStudentsIncluded)
            totalStudentsExcluded = new Set(totalStudentsExcluded)
            totalStudentsExcluded = Array.from(totalStudentsExcluded)
        }


        totalResponses = totalStudentsIncluded.length
        if (totalResponses == 0 && totalStudentsExcluded.length > 0) {
            // Make total students be equal to the total number of students in the class minus the number of students who failed the perm check
            totalResponders = Object.keys(classData.students).length - totalStudentsExcluded.length
        } else if (totalResponses == 0) {
            totalStudentsIncluded = Object.keys(classData.students)
            for (let i = totalStudentsIncluded.length - 1; i >= 0; i--) {
                let student = totalStudentsIncluded[i];
                if (classData.students[student].classPermissions >= TEACHER_PERMISSIONS || classData.students[student].classPermissions == GUEST_PERMISSIONS) {
                    totalStudentsIncluded.splice(i, 1);
                }
            }
            totalResponders = totalStudentsIncluded.length
        }
        
        if (classInformation[classCode].poll.multiRes) {
            for (let student of Object.values(classData.students)) {
                if (student.pollRes.buttonRes.length > 1) {
                    totalResponses += student.pollRes.buttonRes.length - 1
                }
            }
        } else {
            for (let value of Object.values(classData.students)) {
                if (value.pollRes.buttonRes != "" || value.pollRes.textRes != "") {
                    totalResponses++;
                }
            }
        }

        // Get rid of students whos permissions are teacher or above or guest
        classInformation[classCode].poll.allowedResponses = totalStudentsIncluded
        classInformation[classCode].poll.unallowedResponses = totalStudentsExcluded

        advancedEmitToClass('vbUpdate', classCode, { classPermissions: CLASS_SOCKET_PERMISSIONS.vbUpdate }, {
            status: classData.poll.status,
            totalResponders: totalResponders,
            totalResponses: totalResponses,
            polls: responses,
            textRes: classData.poll.textRes,
            prompt: classData.poll.prompt,
            weight: classData.poll.weight,
            blind: classData.poll.blind,
            time: classData.timer.time,
            sound: classData.timer.sound,
            active: classData.timer.active,
            timePassed: classData.timer.timePassed,
        })
    } catch (err) {
        logger.log('error', err.stack);
    }
}

function pollUpdate(classCode = socket.request.session.class) {
    try {
        logger.log('info', `[pollUpdate] classCode=(${classCode})`)
        logger.log('verbose', `[pollUpdate] poll=(${JSON.stringify(classInformation[classCode].poll)})`)

        advancedEmitToClass(
            'pollUpdate',
            classCode,
            { classPermissions: CLASS_SOCKET_PERMISSIONS.pollUpdate },
            classInformation[socket.request.session.class].poll
        )
    } catch (err) {
        logger.log('error', err.stack);
    }
}

function modeUpdate(classCode = socket.request.session.class) {
    try {
        logger.log('info', `[modeUpdate] classCode=(${classCode})`)
        logger.log('verbose', `[modeUpdate] mode=(${classInformation[classCode].mode})`)

        advancedEmitToClass(
            'modeUpdate',
            classCode,
            { classPermissions: CLASS_SOCKET_PERMISSIONS.modeUpdate },
            classInformation[socket.request.session.class].mode
        )
    } catch (err) {
        logger.log('error', err.stack);
    }
}

function quizUpdate(classCode = socket.request.session.class) {
    try {
        logger.log('info', `[quizUpdate] classCode=(${classCode})`)
        logger.log('verbose', `[quizUpdate] quiz=(${JSON.stringify(classInformation[classCode].quiz)})`)

        advancedEmitToClass(
            'quizUpdate',
            classCode,
            { classPermissions: CLASS_SOCKET_PERMISSIONS.quizUpdate },
            classInformation[socket.request.session.class].quiz
        )
    } catch (err) {
        logger.log('error', err.stack);
    }
}

function lessonUpdate(classCode = socket.request.session.class) {
    try {
        logger.log('info', `[lessonUpdate] classCode=(${classCode})`)
        logger.log('verbose', `[lessonUpdate] lesson=(${JSON.stringify(classInformation[classCode].lesson)})`)

        advancedEmitToClass(
            'lessonUpdate',
            classCode,
            { classPermissions: CLASS_SOCKET_PERMISSIONS.lessonUpdate },
            classInformation[socket.request.session.class].lesson
        )
    } catch (err) {
        logger.log('error', err.stack);
    }
}

function pluginUpdate(classCode = socket.request.session.class) {
    try {
        logger.log('info', `[pluginUpdate] classCode=(${classCode})`)

        database.all(
            'SELECT plugins.id, plugins.name, plugins.url FROM plugins JOIN classroom ON classroom.key=?',
            [classCode],
            (err, plugins) => {
                try {
                    if (err) throw err

                    logger.log('verbose', `[pluginUpdate] plugins=(${JSON.stringify(plugins)})`)

                    advancedEmitToClass(
                        'pluginUpdate',
                        classCode,
                        { classPermissions: CLASS_SOCKET_PERMISSIONS.pluginUpdate },
                        plugins
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

function customPollUpdate(username) {
    try {
        logger.log('info', `[customPollUpdate] username=(${username})`)
        let userSession = userSockets[username].request.session
        let userSharedPolls = classInformation[userSession.class].students[userSession.username].sharedPolls
        let userOwnedPolls = classInformation[userSession.class].students[userSession.username].ownedPolls
        let userCustomPolls = Array.from(new Set(userSharedPolls.concat(userOwnedPolls)))
        let classroomPolls = structuredClone(classInformation[userSession.class].sharedPolls)
        let publicPolls = []
        let customPollIds = userCustomPolls.concat(classroomPolls)

        logger.log('verbose', `[customPollUpdate] userSharedPolls=(${userSharedPolls}) userOwnedPolls=(${userOwnedPolls}) userCustomPolls=(${userCustomPolls}) classroomPolls=(${classroomPolls}) publicPolls=(${publicPolls}) customPollIds=(${customPollIds})`)

        database.all(
            `SELECT * FROM custom_polls WHERE id IN(${customPollIds.map(() => '?').join(', ')}) OR public = 1 OR owner=?`,
            [
                ...customPollIds,
                userSession.userId
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

                    io.to(`user-${username}`).emit(
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

function classBannedUsersUpdate(classCode = socket.request.session.class) {
    try {
        logger.log('info', `[classBannedUsersUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
        logger.log('info', `[classBannedUsersUpdate] classCode=(${classCode})`)

        if (!classCode || classCode == 'noClass') return

        database.all('SELECT users.username FROM classroom JOIN classusers ON classusers.classId = classroom.id AND classusers.permissions = 0 JOIN users ON users.id = classusers.studentId WHERE classusers.classId=?', classInformation[socket.request.session.class].id, (err, bannedStudents) => {
            try {
                if (err) throw err

                bannedStudents = bannedStudents.map((bannedStudent) => bannedStudent.username)

                advancedEmitToClass(
                    'classBannedUsersUpdate',
                    classCode,
                    { classPermissions: classInformation[classCode].permissions.manageStudents },
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

function classKickUser(username, classCode = socket.request.session.class) {
    try {
        logger.log('info', `[classKickUser] username=(${username}) classCode=(${classCode})`)

        userSockets[username].leave(`class-${classCode}`)
        classInformation.noClass.students[username] = classInformation[classCode].students[username]
        classInformation.noClass.students[username].classPermissions = null
        userSockets[username].request.session.class = 'noClass'
        userSockets[username].request.session.save()
        delete classInformation[classCode].students[username]

        setClassOfApiSockets(classInformation.noClass.students[username].API, 'noClass')

        logger.log('verbose', `[classKickUser] cD=(${JSON.stringify(classInformation)})`)

        userSockets[username].emit('reload')
    } catch (err) {
        logger.log('error', err.stack);
    }
}

function classKickStudents(classCode) {
    try {
        logger.log('info', `[classKickStudents] classCode=(${classCode})`)

        for (let username of Object.keys(classInformation[classCode].students)) {
            if (classInformation[classCode].students[username].classPermissions < TEACHER_PERMISSIONS) {
                classKickUser(username, classCode)
            }
        }
    } catch (err) {
        logger.log('error', err.stack);
    }
}

function logout(socket) {
    const username = socket.request.session.username
    const userId = socket.request.session.userId
    const classCode = socket.request.session.class
    const className = classInformation[classCode].className

    socket.request.session.destroy((err) => {
        try {
            if (err) throw err

            delete userSockets[username]
            delete classInformation[classCode].students[username]
            socket.leave(`class-${classCode}`)
            socket.emit('reload')
            classPermissionUpdate(classCode)
            virtualBarUpdate(classCode)

            database.get(
                'SELECT * FROM classroom WHERE owner=? AND key=?',
                [userId, classCode],
                (err, classroom) => {
                    if (err) logger.log('error', err.stack)
                    if (classroom) endClass(classroom.key)
                }
            )
        } catch (err) {
            logger.log('error', err.stack)
        }
    })
}

async function endPoll() {
    try {
        logger.log('info', `[endPoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

        let data = { prompt: '', names: [], letter: [], text: [] }
        currentPoll += 1

        let dateConfig = new Date()
        let date = `${dateConfig.getMonth() + 1} /${dateConfig.getDate()}/${dateConfig.getFullYear()}`

        data.prompt = classInformation[socket.request.session.class].poll.prompt

        for (const key in classInformation[socket.request.session.class].students) {
            data.names.push(classInformation[socket.request.session.class].students[key].username)
            data.letter.push(classInformation[socket.request.session.class].students[key].pollRes.buttonRes)
            data.text.push(classInformation[socket.request.session.class].students[key].pollRes.textRes)
        }

        await new Promise((resolve, reject) => {
            database.run(
                'INSERT INTO poll_history(class, data, date) VALUES(?, ?, ?)',
                [classInformation[socket.request.session.class].id, JSON.stringify(data), date], (err) => {
                    if (err) {
                        logger.log('error', err.stack);
                        reject(new Error(err));
                    } else {
                        logger.log('verbose', '[endPoll] saved poll to history');
                        resolve();
                    };
                }
            );
        });

        let latestPoll = await new Promise((resolve, reject) => {
            database.get('SELECT * FROM poll_history WHERE class=? ORDER BY id DESC LIMIT 1', [
                classInformation[socket.request.session.class].id
            ], (err, poll) => {
                if (err) {
                    logger.log("error", err.stack);
                    reject(new Error(err));
                } else resolve(poll);
            });
        });

        latestPoll.data = JSON.parse(latestPoll.data);
        classInformation[socket.request.session.class].pollHistory.push(latestPoll);

        classInformation[socket.request.session.class].poll.status = false

        logger.log('verbose', `[endPoll] classData=(${JSON.stringify(classInformation[socket.request.session.class])})`)
    } catch (err) {
        logger.log('error', err.stack);
    }
}

async function clearPoll(classCode = socket.request.session.class) {
    if (classInformation[classCode].poll.status) await endPoll()

    classInformation[classCode].poll.responses = {};
    classInformation[classCode].poll.prompt = "";
    classInformation[classCode].poll = {
        status: false,
        responses: {},
        textRes: false,
        prompt: "",
        weight: 1,
        blind: false,
        requiredTags: [],
        studentBoxes: [],
        studentIndeterminate: [],
        lastResponse: [],
        allowedResponses: [],
    };
}

async function endClass(classCode) {
    try {
        logger.log('info', `[endClass] classCode=(${classCode})`)

        await advancedEmitToClass('endClassSound', classCode, { api: true })

        for (let username of Object.keys(classInformation[classCode].students)) {
            classKickUser(username, classCode)
        }
        delete classInformation[classCode]

        logger.log('verbose', `[endClass] cD=(${JSON.stringify(classInformation)})`)
    } catch (err) {
        logger.log('error', err.stack);
    }
}

function getOwnedClasses(username) {
    try {
        logger.log('info', `[getOwnedClasses] username=(${username})`)

        database.all('SELECT name, id FROM classroom WHERE owner=?',
            [userSockets[username].request.session.userId], (err, ownedClasses) => {
                try {
                    if (err) throw err

                    logger.log('info', `[getOwnedClasses] ownedClasses=(${JSON.stringify(ownedClasses)})`)

                    io.to(`user-${username}`).emit('getOwnedClasses', ownedClasses)
                } catch (err) {
                    logger.log('error', err.stack);
                }
            }
        )
    } catch (err) {
        logger.log('error', err.stack);
    }
}

function getPollShareIds(pollId) {
    try {
        logger.log('info', `[getPollShareIds] pollId=(${pollId})`)

        database.all(
            'SELECT pollId, userId, username FROM shared_polls LEFT JOIN users ON users.id = shared_polls.userId WHERE pollId=?',
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

                                socket.emit('getPollShareIds', userPollShares, classPollShares)
                            } catch (err) {
                                logger.log('error', err.stack);
                            }
                        }
                    )
                } catch (err) {

                }
            }
        )
    } catch (err) {
        logger.log('error', err.stack);
    }
}

async function deleteCustomPolls(userId) {
    try {
        const customPolls = await getAll('SELECT * FROM custom_polls WHERE owner=?', userId)

        if (customPolls.length == 0) return

        await runQuery('DELETE FROM custom_polls WHERE userId=?', customPolls[0].userId)

        for (let customPoll of customPolls) {
            await runQuery('DELETE FROM shared_polls WHERE pollId=?', customPoll.pollId)
        }
    } catch (err) {
        throw err
    }
}

async function deleteClassrooms(userId) {
    try {
        const classrooms = await getAll('SELECT * FROM classroom WHERE owner=?', userId)

        if (classrooms.length == 0) return

        await runQuery('DELETE FROM classroom WHERE owner=?', classrooms[0].owner)

        for (let classroom of classrooms) {
            if (classInformation[classroom.key]) endClass(classroom.key)

            await Promise.all([
                runQuery('DELETE FROM classusers WHERE classId=?', classroom.id),
                runQuery('DELETE FROM class_polls WHERE classId=?', classroom.id),
                runQuery('DELETE FROM plugins WHERE classId=?', classroom.id),
                runQuery('DELETE FROM lessons WHERE class=?', classroom.id)
            ])
        }
    } catch (err) {
        throw err
    }
}

function ipUpdate(type, username) {
    try {
        logger.log('info', `[ipUpdate] username=(${username})`)

        let ipList = {}
        if (type == 'whitelist') ipList = whitelistedIps
        else if (type == 'blacklist') ipList = blacklistedIps

        if (type) {
            if (username) io.to(`user-${username}`).emit('ipUpdate', type, settings[`${type}Active`], ipList)
            else io.emit('ipUpdate', type, settings[`${type}Active`], ipList)
        } else {
            ipUpdate('whitelist', username)
            ipUpdate('blacklist', username)
        }
    } catch (err) {
        logger.log('error', err.stack);
    }
}

async function reloadPageByIp(include, ip) {
    for (let userSocket of await io.fetchSockets()) {
        let userIp = userSocket.handshake.address

        if (userIp.startsWith('::ffff:')) userIp = userIp.slice(7)

        if (
            (include &&
                userIp.startsWith(ip)
            ) ||
            (
                !include &&
                !userIp.startsWith(ip)
            )
        ) {
            userSocket.emit('reload')
        }
    }
}

function timer(sound, active) {
    try {
        let classData = classInformation[socket.request.session.class];

        if (classData.timer.timeLeft <= 0) {
            clearInterval(runningTimers[socket.request.session.class]);
            runningTimers[socket.request.session.class] = null;
        }

        if (classData.timer.timeLeft > 0 && active) classData.timer.timeLeft--;

        if (classData.timer.timeLeft <= 0 && active && sound) {
            advancedEmitToClass('timerSound', socket.request.session.class, {
                classPermissions: Math.max(CLASS_SOCKET_PERMISSIONS.vbTimer, classInformation[socket.request.session.class].permissions.sounds),
                api: true
            });
        }

        advancedEmitToClass('vbTimer', socket.request.session.class, {
            classPermissions: CLASS_SOCKET_PERMISSIONS.vbTimer
        }, classData.timer);
    } catch (err) {
        logger.log('error', err.stack);
    }
}

module.exports = {
    // Socket information
    runningTimers,
    rateLimits,
    userSockets,

    // Functions
    classPermissionUpdate,
    virtualBarUpdate,
    pollUpdate,
    modeUpdate,
    quizUpdate,
    lessonUpdate,
    pluginUpdate,
    customPollUpdate,
    classBannedUsersUpdate,
    classKickUser,
    classKickStudents,
    logout,
    endPoll,
    clearPoll,
    endClass,
    getOwnedClasses,
    getPollShareIds,
    deleteCustomPolls,
    deleteClassrooms,
    ipUpdate,
    reloadPageByIp,
    timer
};