// @TODO: Separate all of these into different routes

const { database } = require("../modules/database")
const { classInformation } = require("../modules/class")
const { logger } = require("../modules/logger")
const { GUEST_PERMISSIONS, TEACHER_PERMISSIONS, CLASS_SOCKET_PERMISSIONS, GLOBAL_SOCKET_PERMISSIONS } = require("../modules/permissions");
const { settings } = require("../modules/config");

const io = createSocketServer()
const runningTimers = {};
const rateLimits = {}
const userSockets = {}
let currentPoll = 0

// Socket.io functions
async function managerUpdate() {
	let [users, classrooms] = await Promise.all([
		new Promise((resolve, reject) => {
			database.all('SELECT id, username, permissions, displayName FROM users', (err, users) => {
				if (err) reject(new Error(err))
				else {
					users = users.reduce((tempUsers, tempUser) => {
						tempUsers[tempUser.username] = tempUser
						return tempUsers
					}, {})
					resolve(users)
				}
			})
		}),
		new Promise((resolve, reject) => {
			database.get('SELECT * FROM classroom', (err, classrooms) => {
				if (err) reject(new Error(err))
				else resolve(classrooms)
			})
		})
	])

	io.emit('managerUpdate', users, classrooms)
}

/**
	 * Emits an event to sockets based on user permissions
	 * @param {string} event - The event to emit
	 * @param {string} classCode - The code of the class
	 * @param {{permissions?: number, classPermissions?: number, api?: boolean, username?: string}} options - The options object
	 * @param  {...any} data - Additional data to emit with the event
	 */
async function advancedEmitToClass(event, classCode, options, ...data) {
	let classData = classInformation[classCode]

	let sockets = await io.in(`class-${classCode}`).fetchSockets()

	for (let socket of sockets) {
		let user = classData.students[socket.request.session.username]
		let hasAPI = false

		if (!user) continue

		if (options.permissions && user.permissions < options.permissions) continue
		if (options.classPermissions && user.classPermissions < options.classPermissions) continue
		if (options.username && user.username != options.username) continue

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

function createSocketServer(http) {
    return require('socket.io')(http)
}

// Handles the websocket communications
function initSocketRoutes() {
    io.on('connection', async (socket) => {
        try {
            const { api } = socket.request.headers

            if (api) {
                await new Promise((resolve, reject) => {
                    database.get(
                        'SELECT id, username FROM users WHERE API=?',
                        [api],
                        (err, userData) => {
                            try {
                                if (err) throw err
                                if (!userData) {
                                    logger.log('verbose', '[socket authentication] not a valid API Key')
                                    throw 'Not a valid API key'
                                }

                                socket.request.session.api = api
                                socket.request.session.userId = userData.id
                                socket.request.session.username = userData.username
                                socket.request.session.class = getUserClass(userData.username) || 'noClass'

                                socket.join(`api-${socket.request.session.api}`)
                                socket.join(`class-${socket.request.session.class}`)

                                socket.emit('setClass', socket.request.session.class)

                                resolve()
                            } catch (err) {
                                reject(err)
                            }
                        }
                    )
                }).catch((err) => {
                    if (err instanceof Error) throw err
                })
            } else if (socket.request.session.username) {
                socket.join(`class-${socket.request.session.class}`)
                socket.join(`user-${socket.request.session.username}`)

                userSockets[socket.request.session.username] = socket
            }
        } catch (err) {
            logger.log('error', err.stack);
        }
    
        function cpUpdate(classCode = socket.request.session.class) {
            try {
                logger.log('info', `[cpUpdate] classCode=(${classCode})`)

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

        function vbUpdate(classCode = socket.request.session.class) {
            try {
                logger.log('info', `[vbUpdate] classCode=(${classCode})`)

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

                logger.log('verbose', `[vbUpdate] status=(${classData.poll.status}) totalResponses=(${Object.keys(classData.students).length}) polls=(${JSON.stringify(responses)}) textRes=(${classData.poll.textRes}) prompt=(${classData.poll.prompt}) weight=(${classData.poll.weight}) blind=(${classData.poll.blind})`)


                let totalResponses = 0;
                let totalResponders = 0
                let totalStudentsIncluded = []
                let totalStudentsExcluded = []
                let totalLastResponses = classData.poll.lastResponse

                //Add to the included array, then add to the excluded array, then remove from the included array. Do not add the same student to either array
                if (totalLastResponses.length > 0) {
                    totalResponses = totalLastResponses.length
                    totalStudentsIncluded = totalLastResponses
                }
                else {
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
                    //Make total students be equal to the total number of students in the class minus the number of students who failed the perm check
                    totalResponders = Object.keys(classData.students).length - totalStudentsExcluded.length
                }
                else if (totalResponses == 0) {
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

                //Get rid of students whos permissions are teacher or above or guest
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
                    cpUpdate(classCode)
                    vbUpdate(classCode)

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

        // Authentication for users and plugins to connect to formbar websockets
        // The user must be logged in order to connect to websockets
        socket.use(([event, ...args], next) => {
            try {
                let { api } = socket.request.headers

                logger.log('info', `[socket authentication] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)}) api=(${api}) event=(${event})`)

                if (socket.request.session.username) {
                    next()
                } else if (api) {
                    database.get(
                        'SELECT id, username FROM users WHERE API = ?',
                        [api],
                        (err, userData) => {
                            try {
                                if (err) throw err
                                if (!userData) {
                                    logger.log('verbose', '[socket authentication] not a valid API Key')
                                    next(new Error('Not a valid API key'))
                                    return
                                }

                                socket.request.session.api = api
                                socket.request.session.userId = userData.id
                                socket.request.session.username = userData.username
                                socket.request.session.class = 'noClass'

                                next()
                            } catch (err) {
                                logger.log('error', err.stack)
                            }
                        }
                    )
                } else if (event == 'reload') {
                    next()
                } else {
                    logger.log('info', '[socket authentication] Missing username or api')
                    next(new Error('Missing API key'))
                }
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        //rate limiter
        socket.use(([event, ...args], next) => {
            try {
                const username = socket.request.session.username
                const currentTime = Date.now()
                const limit = 5
                const timeFrame = 5000
                const blockTime = 5000
                const limitedRequests = ['pollResp', 'help', 'break']

                logger.log('info', `[rate limiter] username=(${username}) currentTime=(${currentTime})`)

                if (!rateLimits[username]) {
                    rateLimits[username] = {}
                }

                const userRequests = rateLimits[username]

                if (!limitedRequests.includes(event)) {
                    next()
                    return
                }

                userRequests[event] = userRequests[event] || []

                userRequests[event] = userRequests[event].filter((timestamp) => currentTime - timestamp < timeFrame)

                logger.log('verbose', `[rate limiter] userRequests=(${JSON.stringify(userRequests)})`)

                if (userRequests[event].length >= limit) {
                    socket.emit('message', `You are being rate limited. Please try again in a ${blockTime / 1000} seconds.`)
                    next(new Error('Rate limited'))
                    setTimeout(() => {
                        try {
                            userRequests[event].shift()
                        } catch (err) {
                            logger.log('error', err.stack);
                        }
                    }, blockTime)
                } else {
                    userRequests[event].push(currentTime)
                    next()
                }
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        // permission check
        socket.use(async ([event, ...args], next) => {
            try {
                let username = socket.request.session.username
                let classCode = socket.request.session.class

                logger.log('info', `[socket permission check] Event=(${event}), Username=(${username}), ClassCod=(${classCode})`)

                if (!classInformation[classCode]) {
                    logger.log('info', '[socket permission check] Class does not exist')
                    socket.emit('message', 'Class does not exist')
                    return
                }
                if (!classInformation[classCode].students[username]) {
                    logger.log('info', '[socket permission check] User is not logged in')
                    socket.emit('message', 'User is not logged in')
                    return
                }

                if (
                    GLOBAL_SOCKET_PERMISSIONS[event] &&
                    classInformation[classCode].students[username].permissions >= GLOBAL_SOCKET_PERMISSIONS[event]
                ) {
                    logger.log('info', '[socket permission check] Global socket permission check passed')
                    next()
                } else if (
                    CLASS_SOCKET_PERMISSIONS[event] &&
                    classInformation[classCode].students[username].classPermissions >= CLASS_SOCKET_PERMISSIONS[event]
                ) {
                    logger.log('info', '[socket permission check] Class socket permission check passed')
                    next()
                } else if (
                    CLASS_SOCKET_PERMISSION_SETTINGS[event] &&
                    classInformation[classCode].permissions[CLASS_SOCKET_PERMISSION_SETTINGS[event]] &&
                    classInformation[classCode].students[username].classPermissions >= classInformation[classCode].permissions[CLASS_SOCKET_PERMISSION_SETTINGS[event]]
                ) {
                    logger.log('info', '[socket permission check] Class socket permission settings check passed')
                    next()
                } else {
                    if (!PASSIVE_SOCKETS.includes(event)) {
                        logger.log('info', `[socket permission check] User does not have permission to use ${camelCaseToNormal(event)}`)
                        socket.emit('message', `You do not have permission to use ${camelCaseToNormal(event)}.`)
                    }
                }
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // /poll websockets for updating the database
        socket.on('pollResp', (res, textRes, resWeight, resLength) => {
            try {
                logger.log('info', `[pollResp] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[pollResp] res=(${res}) textRes=(${textRes}) resWeight=(${resWeight}) resLength=(${resLength})`)

                if (
                    classInformation[socket.request.session.class].students[socket.request.session.username].pollRes.buttonRes != res ||
                    classInformation[socket.request.session.class].students[socket.request.session.username].pollRes.textRes != textRes
                ) {
                    if (res == 'remove')
                        advancedEmitToClass('removePollSound', socket.request.session.class, { api: true })
                    else
                        advancedEmitToClass('pollSound', socket.request.session.class, { api: true })
                }

                classInformation[socket.request.session.class].students[socket.request.session.username].pollRes.buttonRes = res
                classInformation[socket.request.session.class].students[socket.request.session.username].pollRes.textRes = textRes
                classInformation[socket.request.session.class].students[socket.request.session.username].pollRes.time = new Date()


                for (let i = 0; i < resLength; i++) {
                    if (res) {
                        let calcWeight = classInformation[socket.request.session.class].poll.weight * resWeight
                        classInformation[socket.request.session.class].students[socket.request.session.username].pogMeter += calcWeight
                        if (classInformation[socket.request.session.class].students[socket.request.session.username].pogMeter >= 25) {
                            database.get('SELECT digipogs FROM classusers WHERE studentId=?', [classInformation[socket.request.session.class].students[socket.request.session.username].id], (err, data) => {
                                try {
                                    if (err) throw err

                                    database.run('UPDATE classusers SET digiPogs=? WHERE studentId=?', [data + 1, classInformation[socket.request.session.class].students[socket.request.session.username].id], (err) => {
                                        try {
                                            if (err) throw err

                                            logger.log('verbose', `[pollResp] Added 1 digipog to ${socket.request.session.username}`)
                                        } catch (err) {
                                            logger.log('error', err.stack);
                                        }
                                    })
                                } catch (err) {
                                    logger.log('error', err.stack);
                                }
                            })
                            classInformation[socket.request.session.class].students[socket.request.session.username].pogMeter = 0
                        }
                    }
                }
                logger.log('verbose', `[pollResp] user=(${classInformation[socket.request.session.class].students[socket.request.session.username]})`)

                cpUpdate()
                vbUpdate()
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        // Changes Permission of user. Takes which user and the new permission level
        socket.on('classPermChange', (user, newPerm) => {
            try {
                logger.log('info', `[classPermChange] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[classPermChange] user=(${user}) newPerm=(${newPerm})`)
                classInformation[socket.request.session.class].students[user].classPermissions = newPerm

                database.run('UPDATE classusers SET permissions=? WHERE classId=? AND studentId=?', [
                    newPerm,
                    classInformation[socket.request.session.class].id,
                    classInformation[socket.request.session.class].students[user].id
                ])

                logger.log('verbose', `[classPermChange] user=(${JSON.stringify(classInformation[socket.request.session.class].students[user])})`)
                io.to(`user-${user}`).emit('reload')

                //cpUpdate()
                //Commented Out to fix Issue #231 checkbox 14, tags not updating when permissions are changed and page is not refreashed
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('permChange', async (username, newPerm) => {
            try {
                newPerm = Number(newPerm)

                logger.log('info', `[permChange] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[permChange] user=(${username}) newPerm=(${newPerm})`)

                let classCode = getUserClass(username)
                if (classCode instanceof Error) throw classCode

                if (classCode) {
                    classInformation[classCode].students[username].permissions = newPerm

                    if (
                        classInformation[classCode].students[username].permissions < TEACHER_PERMISSIONS &&
                        Object.keys(classInformation[classCode].students)[0] == username
                    ) {
                        endClass(classCode)
                    }

                    io.to(`user-${username}`).emit('reload')
                }

                database.run('UPDATE users SET permissions=? WHERE username=?', [newPerm, username])
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        // Starts a new poll. Takes the number of responses and whether or not their are text responses
        socket.on('startPoll', async (resNumber, resTextBox, pollPrompt, polls, blind, weight, tags, boxes, indeterminate, lastResponse, multiRes) => {
            try {
                logger.log('info', `[startPoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[startPoll] resNumber=(${resNumber}) resTextBox=(${resTextBox}) pollPrompt=(${pollPrompt}) polls=(${JSON.stringify(polls)}) blind=(${blind}) weight=(${weight}) tags=(${tags})`)

                await clearPoll()
                let generatedColors = generateColors(resNumber)
                logger.log('verbose', `[pollResp] user=(${classInformation[socket.request.session.class].students[socket.request.session.username]})`)
                if (generatedColors instanceof Error) throw generatedColors

                classInformation[socket.request.session.class].mode = 'poll'
                classInformation[socket.request.session.class].poll.blind = blind
                classInformation[socket.request.session.class].poll.status = true
                if (tags) {
                    classInformation[socket.request.session.class].poll.requiredTags = tags
                }
                else {
                    classInformation[socket.request.session.class].poll.requiredTags = []
                }
                if (boxes) {
                    classInformation[socket.request.session.class].poll.studentBoxes = boxes
                }
                else {
                    classInformation[socket.request.session.class].poll.studentBoxes = []
                }
                if (indeterminate) {
                    classInformation[socket.request.session.class].poll.studentIndeterminate = indeterminate
                }
                else {
                    classInformation[socket.request.session.class].poll.studentIndeterminate = []
                }
                if (lastResponse) {
                    classInformation[socket.request.session.class].poll.lastResponse = lastResponse
                }
                else {
                    classInformation[socket.request.session.class].poll.lastResponse = []
                }






                // Creates an object for every answer possible the teacher is allowing
                for (let i = 0; i < resNumber; i++) {
                    let letterString = 'abcdefghijklmnopqrstuvwxyz'
                    let answer = letterString[i]
                    let weight = 1
                    let color = generatedColors[i]

                    if (polls[i].answer)
                        answer = polls[i].answer
                    if (polls[i].weight)
                        weight = polls[i].weight
                    if (polls[i].color)
                        color = polls[i].color

                    classInformation[socket.request.session.class].poll.responses[answer] = {
                        answer: answer,
                        weight: weight,
                        color: color
                    }
                }

                classInformation[socket.request.session.class].poll.weight = weight
                classInformation[socket.request.session.class].poll.textRes = resTextBox
                classInformation[socket.request.session.class].poll.prompt = pollPrompt
                classInformation[socket.request.session.class].poll.multiRes = multiRes

                for (var key in classInformation[socket.request.session.class].students) {
                    classInformation[socket.request.session.class].students[key].pollRes.buttonRes = ''
                    classInformation[socket.request.session.class].students[key].pollRes.textRes = ''
                }

                logger.log('verbose', `[startPoll] classData=(${JSON.stringify(classInformation[socket.request.session.class])})`)

                pollUpdate()
                vbUpdate()
                cpUpdate()
                socket.emit('startPoll')
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        // End the current poll. Does not take any arguments
        socket.on('clearPoll', async () => {
            try {
                await clearPoll();
                //adds data to the previous poll answers table upon clearing the poll
                for (var student of Object.values(classInformation[socket.request.session.class].students)) {
                    if (student.classPermissions != 5) {
                        var currentPollId = classInformation[socket.request.session.class].pollHistory[currentPoll].id
                        for (let i = 0; i < student.pollRes.buttonRes.length; i++) {
                            var studentRes = student.pollRes.buttonRes[i]
                            var studentId = student.id
                            database.run('INSERT INTO poll_answers(pollId, userId, buttonResponse) VALUES(?, ?, ?)', [currentPollId, studentId, studentRes], (err) => {
                                if (err) {
                                    logger.log('error', err.stack)
                                }
                            })
                        }
                        var studentTextRes = student.pollRes.textRes
                        var studentId = student.id
                        database.run('INSERT INTO poll_answers(pollId, userId, textResponse) VALUES(?, ?, ?)', [currentPollId, studentId, studentTextRes], (err) => {
                            if (err) {
                                logger.log('error', err.stack)
                            }
                        })
                    }
                }

                pollUpdate();
                vbUpdate();
                cpUpdate();
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('endPoll', async () => {
            try {
                await endPoll();
                pollUpdate();
                cpUpdate();
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('pollUpdate', () => {
            logger.log('info', `[pollUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            pollUpdate()
        })

        socket.on('modeUpdate', () => {
            logger.log('info', `[modeUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            modeUpdate()
        })

        socket.on('quizUpdate', () => {
            logger.log('info', `[quizUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            quizUpdate()
        })

        socket.on('lessonUpdate', () => {
            logger.log('info', `[lessonUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            lessonUpdate()
        })

        // Sends poll and student response data to client side virtual bar
        socket.on('vbUpdate', () => {
            logger.log('info', `[vbUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            vbUpdate()
        })

        socket.on('customPollUpdate', () => {
            logger.log('info', `[customPollUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            customPollUpdate(socket.request.session.username)
        })

        socket.on('savePoll', (poll, id) => {
            try {
                logger.log('info', `[savePoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[savePoll] poll=(${JSON.stringify(poll)}) id=(${id})`)

                let userId = socket.request.session.userId

                if (id) {
                    database.get('SELECT * FROM custom_polls WHERE id=?', [id], (err, poll) => {
                        try {
                            if (err) throw err

                            if (userId != poll.owner) {
                                socket.emit('message', 'You do not have permission to edit this poll.')
                                return
                            }

                            database.run('UPDATE custom_polls SET name=?, prompt=?, answers=?, textRes=?, blind=?, weight=?, public=? WHERE id=?', [
                                poll.name,
                                poll.prompt,
                                JSON.stringify(poll.answers),
                                poll.textRes,
                                poll.blind,
                                poll.weight,
                                poll.public,
                                id
                            ], (err) => {
                                try {
                                    if (err) throw err

                                    socket.emit('message', 'Poll saved successfully!')
                                    customPollUpdate(socket.request.session.username)
                                } catch (err) {
                                    logger.log('error', err.stack);
                                }
                            })
                        } catch (err) {
                            logger.log('error', err.stack);
                        }
                    })
                } else {
                    database.get('SELECT seq AS nextPollId from sqlite_sequence WHERE name = "custom_polls"', (err, nextPollId) => {
                        try {
                            if (err) throw err
                            if (!nextPollId) logger.log('critical', '[savePoll] nextPollId not found')

                            nextPollId = nextPollId.nextPollId + 1

                            database.run('INSERT INTO custom_polls (owner, name, prompt, answers, textRes, blind, weight, public) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
                                userId,
                                poll.name,
                                poll.prompt,
                                JSON.stringify(poll.answers),
                                poll.textRes,
                                poll.blind,
                                poll.weight,
                                poll.public
                            ], (err) => {
                                try {
                                    if (err) throw err

                                    classInformation[socket.request.session.class].students[socket.request.session.username].ownedPolls.push(nextPollId)
                                    socket.emit('message', 'Poll saved successfully!')
                                    customPollUpdate(socket.request.session.username)
                                } catch (err) {
                                    logger.log('error', err.stack);
                                }
                            })
                        } catch (err) {
                            logger.log('error', err.stack);
                        }
                    })
                }
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('deletePoll', (pollId) => {
            try {
                let userId = socket.request.session.userId

                logger.log('info', `[deletePoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)}) pollId=(${pollId})`)
                logger.log('info', `[deletePoll] pollId=(${pollId})`)

                if (!pollId) {
                    socket.emit('message', 'No poll is selected.')
                    return
                }

                database.get('SELECT * FROM custom_polls WHERE id=?', pollId, async (err, poll) => {
                    try {
                        if (err) throw err

                        logger.log('info', `[deletePoll] poll=(${JSON.stringify(poll)})`)

                        if (userId != poll.owner) {
                            logger.log('info', '[deletePoll] not owner')
                            socket.emit('message', 'You do not have permission to delete this poll.')
                            return
                        }

                        await runQuery('BEGIN TRANSACTION')

                        await Promise.all([
                            runQuery('DELETE FROM custom_polls WHERE id=?', pollId),
                            runQuery('DELETE FROM shared_polls WHERE pollId=?', pollId),
                            runQuery('DELETE FROM class_polls WHERE pollId=?', pollId),
                        ]).catch(async (err) => {
                            await runQuery('ROLLBACK')
                            throw err
                        })

                        await runQuery('COMMIT')

                        for (let classroom of Object.values(classInformation)) {
                            let updatePolls = false

                            if (classroom.sharedPolls) {
                                if (classroom.sharedPolls.includes(pollId)) {
                                    classroom.sharedPolls.splice(classroom.sharedPolls.indexOf(pollId), 1)
                                    updatePolls = true
                                }
                            }

                            for (let user of Object.values(classroom.students)) {
                                if (user.sharedPolls.includes(pollId)) {
                                    user.sharedPolls.splice(user.sharedPolls.indexOf(pollId), 1)
                                    updatePolls = true
                                }

                                if (user.ownedPolls.includes(pollId)) {
                                    user.ownedPolls.splice(user.ownedPolls.indexOf(pollId), 1)
                                    updatePolls = true
                                }

                                if (updatePolls)
                                    customPollUpdate(user.username)
                            }
                        }

                        logger.log('info', '[deletePoll] deleted')
                        socket.emit('message', 'Poll deleted successfully!')
                    } catch (err) {
                        logger.log('error', err.stack);
                    }
                })
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('setPublicPoll', (pollId, value) => {
            try {
                logger.log('info', `[setPublicPoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[setPublicPoll] pollId=(${pollId}) value=(${value})`)

                database.run('UPDATE custom_polls set public=? WHERE id=?', [value, pollId], (err) => {
                    try {
                        if (err) throw err

                        for (let userSocket of Object.values(userSockets)) {
                            customPollUpdate(userSocket.request.session.username)
                        }
                    } catch (err) {
                        logger.log('error', err.stack);
                    }
                })
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('sharePollToUser', (pollId, username) => {
            try {
                logger.log('info', `[sharePollToUser] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[sharePollToUser] pollId=(${pollId}) username=(${username})`)

                database.get('SELECT * FROM users WHERE username=?', username, (err, user) => {
                    try {
                        if (err) throw err

                        if (!user) {
                            logger.log('info', 'User does not exist')
                            socket.emit('message', 'User does not exist')
                            return
                        }

                        database.get('SELECT * FROM custom_polls WHERE id=?', pollId, (err, poll) => {
                            try {
                                if (err) throw err

                                if (!poll) {
                                    logger.log('critical', 'Poll does not exist')
                                    socket.emit('message', 'Poll does not exist (Please contact the programmer)')
                                    return
                                }

                                let name = 'Unnamed Poll'
                                if (poll.name) name = poll.name
                                else if (poll.prompt) name = poll.prompt

                                database.get(
                                    'SELECT * FROM shared_polls WHERE pollId=? AND userId=?',
                                    [pollId, user.id],
                                    (err, sharePoll) => {
                                        try {
                                            if (err) throw err

                                            if (sharePoll) {
                                                socket.emit('message', `${name} is Already Shared with ${username}`)
                                                return
                                            }

                                            database.run(
                                                'INSERT INTO shared_polls (pollId, userId) VALUES (?, ?)',
                                                [pollId, user.id],
                                                async (err) => {
                                                    try {
                                                        if (err) throw err

                                                        socket.emit('message', `Shared ${name} with ${username}`)

                                                        getPollShareIds(pollId)

                                                        let classCode = getUserClass(username)

                                                        if (classCode instanceof Error) throw classCode
                                                        if (!classCode) return

                                                        classInformation[classCode].students[user.username].sharedPolls.push(pollId)

                                                        customPollUpdate(username)
                                                    } catch (err) {
                                                        logger.log('error', err.stack);
                                                    }
                                                }
                                            )
                                        } catch (err) {
                                            logger.log('error', err.stack);
                                        }
                                    }
                                )
                            } catch (err) {
                                logger.log('error', err.stack);
                            }
                        })
                    } catch (err) {
                        logger.log('error', err.stack);
                    }
                })
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('removeUserPollShare', (pollId, userId) => {
            try {
                logger.log('info', `[removeUserPollShare] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[removeUserPollShare] pollId=(${pollId}) userId=(${userId})`)

                database.get(
                    'SELECT * FROM shared_polls WHERE pollId=? AND userId=?',
                    [pollId, userId],
                    (err, pollShare) => {
                        try {
                            if (err) throw err

                            if (!pollShare) {
                                logger.log('critical', '[removeUserPollShare] Poll is not shared to this user')
                                socket.emit('message', 'Poll is not shared to this user')
                                return
                            }

                            database.run(
                                'DELETE FROM shared_polls WHERE pollId=? AND userId=?',
                                [pollId, userId],
                                (err) => {
                                    try {
                                        if (err) throw err

                                        socket.emit('message', 'Successfully unshared user')
                                        getPollShareIds(pollId)

                                        database.get('SELECT * FROM users WHERE id=?', userId, async (err, user) => {
                                            try {
                                                if (err) throw err

                                                if (!user) {
                                                    logger.log('critical', '[removeUserPollShare] User does not exist')
                                                    socket.emit('message', 'User does not exist')
                                                    return
                                                }

                                                let classCode = getUserClass(user.username)

                                                if (classCode instanceof Error) throw classCode
                                                if (!classCode) return

                                                let sharedPolls = classInformation[classCode].students[user.username].sharedPolls
                                                sharedPolls.splice(sharedPolls.indexOf(pollId), 1)
                                                customPollUpdate(user.username)
                                            } catch (err) {
                                                logger.log('error', err.stack);
                                            }
                                        })
                                    } catch (err) {
                                        logger.log('error', err.stack);
                                    }
                                }
                            )
                        } catch (err) {
                            logger.log('error', err.stack);
                        }
                    }
                )
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('getPollShareIds', (pollId) => {
            logger.log('info', `[getPollShareIds] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            logger.log('info', `[getPollShareIds] pollId=(${pollId})`)

            getPollShareIds(pollId)
        })

        socket.on('sharePollToClass', (pollId, classCode) => {
            try {
                logger.log('info', `[sharePollToClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[sharePollToClass] pollId=(${pollId}) classCode=(${classCode})`)

                database.get('SELECT * FROM classroom WHERE key=?', classCode, (err, classroom) => {
                    try {
                        if (err) throw err

                        if (!classroom) {
                            socket.emit('message', 'There is no class with that code.')
                            return
                        }

                        database.get('SELECT * FROM custom_polls WHERE id=?', pollId, (err, poll) => {
                            try {
                                if (err) throw err

                                if (!poll) {
                                    logger.log('critical', 'Poll does not exist (Please contact the programmer)')
                                    socket.emit('message', 'Poll does not exist (Please contact the programmer)')
                                    return
                                }

                                let name = 'Unnamed Poll'
                                if (poll.name) name = poll.name
                                else if (poll.prompt) name = poll.prompt

                                database.get(
                                    'SELECT * FROM class_polls WHERE pollId=? AND classId=?',
                                    [pollId, classroom.id],
                                    (err, sharePoll) => {
                                        try {
                                            if (err) throw err

                                            if (sharePoll) {
                                                socket.emit('message', `${name} is Already Shared with that class`)
                                                return
                                            }

                                            database.run(
                                                'INSERT INTO class_polls (pollId, classId) VALUES (?, ?)',
                                                [pollId, classroom.id],
                                                async (err) => {
                                                    try {
                                                        if (err) throw err

                                                        socket.emit('message', `Shared ${name} with that class`)

                                                        getPollShareIds(pollId)

                                                        classInformation[classCode].sharedPolls.push(pollId)
                                                        for (let username of Object.keys(classInformation[classCode].students)) {
                                                            customPollUpdate(username)
                                                        }
                                                    } catch (err) {
                                                        logger.log('error', err.stack)
                                                    }
                                                }
                                            )
                                        } catch (err) {
                                            logger.log('error', err.stack)
                                        }
                                    }
                                )
                            } catch (err) {
                                logger.log('error', err.stack)
                            }
                        })
                    } catch (err) {
                        logger.log('error', err.stack)
                    }
                })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('removeClassPollShare', (pollId, classId) => {
            try {
                logger.log('info', `[removeClassPollShare] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[removeClassPollShare] pollId=(${pollId}) classId=(${classId})`)

                database.get(
                    'SELECT * FROM class_polls WHERE pollId=? AND classId=?',
                    [pollId, classId],
                    (err, pollShare) => {
                        try {
                            if (err) throw err

                            if (!pollShare) {
                                socket.emit('message', 'Poll is not shared to this class')
                                return
                            }

                            database.run(
                                'DELETE FROM class_polls WHERE pollId=? AND classId=?',
                                [pollId, classId],
                                (err) => {
                                    try {
                                        if (err) throw err

                                        socket.emit('message', 'Successfully unshared class')
                                        getPollShareIds(pollId)

                                        database.get('SELECT * FROM classroom WHERE id=?', classId, async (err, classroom) => {
                                            try {
                                                if (err) throw err

                                                if (!classroom) {
                                                    logger.log('critical', 'Classroom does not exist')
                                                    return
                                                }
                                                if (!classInformation[classroom.key]) return

                                                let sharedPolls = classInformation[classroom.key].sharedPolls
                                                sharedPolls.splice(sharedPolls.indexOf(pollId), 1)
                                                for (let username of Object.keys(classInformation[classroom.key].students)) {
                                                    customPollUpdate(username)
                                                }
                                            } catch (err) {
                                                logger.log('error', err.stack);
                                            }
                                        })
                                    } catch (err) {
                                        logger.log('error', err.stack)
                                    }
                                }
                            )
                        } catch (err) {
                            logger.log('error', err.stack)
                        }
                    }
                )
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Sends a help ticket
        socket.on('help', (reason) => {
            try {
                logger.log('info', `[help] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                let time = new Date();

                logger.log('info', `[help] reason=(${reason}) time=(${time})`)

                let student = classInformation[socket.request.session.class].students[socket.request.session.username]

                if (student.help.reason != reason) {
                    advancedEmitToClass('helpSound', socket.request.session.class, { api: true })
                }

                student.help = { reason: reason, time: time }

                logger.log('verbose', `[help] user=(${JSON.stringify(student)}`)

                cpUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Sends a break ticket
        socket.on('requestBreak', (reason) => {
            try {
                logger.log('info', `[requestBreak] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[requestBreak] reason=(${reason})`)

                let student = classInformation[socket.request.session.class].students[socket.request.session.username]

                if (!student.break != reason)
                    advancedEmitToClass('breakSound', socket.request.session.class, { api: true })

                student.break = reason

                logger.log('verbose', `[requestBreak] user=(${JSON.stringify(classInformation[socket.request.session.class].students[socket.request.session.username])})`)

                cpUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Approves the break ticket request
        socket.on('approveBreak', (breakApproval, username) => {
            try {
                logger.log('info', `[approveBreak] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[approveBreak] breakApproval=(${breakApproval}) username=(${username})`)

                let student = classInformation[socket.request.session.class].students[username]
                student.break = breakApproval

                logger.log('verbose', `[approveBreak] user=(${JSON.stringify(classInformation[socket.request.session.class].students[username])})`)

                if (breakApproval) io.to(`user-${username}`).emit('break')
                cpUpdate()
                vbUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Ends the break
        socket.on('endBreak', () => {
            try {
                logger.log('info', `[endBreak] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                let student = classInformation[socket.request.session.class].students[socket.request.session.username]
                student.break = false

                logger.log('verbose', `[endBreak] user=(${JSON.stringify(classInformation[socket.request.session.class].students[socket.request.session.username])})`)

                cpUpdate()
                vbUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Kicks a user from the class
        socket.on('classKickUser', (username) => {
            try {
                logger.log('info', `[classKickUser] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[classKickUser] username=(${username})`)

                const classCode = socket.request.session.class
                classKickUser(username, classCode)
                advancedEmitToClass('leaveSound', classCode, { api: true })
                cpUpdate(classCode)
                vbUpdate(classCode)
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Deletes all students from the class
        socket.on('classKickStudents', () => {
            try {
                logger.log('info', `[classKickStudents] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const classCode = socket.request.session.class
                classKickStudents(classCode)
                advancedEmitToClass('kickStudentsSound', classCode, { api: true })
                cpUpdate(classCode)
                vbUpdate(classCode)
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('leaveClass', () => {
            try {
                logger.log('info', `[leaveClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const userId = socket.request.session.userId
                const username = socket.request.session.username
                const classCode = socket.request.session.class
                classKickUser(username, classCode)
                advancedEmitToClass('leaveSound', classCode, { api: true })
                cpUpdate(classCode)
                vbUpdate(classCode)

                database.get(
                    'SELECT * FROM classroom WHERE owner=? AND key=?',
                    [userId, classCode],
                    (err, classroom) => {
                        if (err) logger.log('error', err.stack)
                        else if (classroom) endClass(classroom.key)
                    }
                )
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('logout', () => {
            try {
                logger.log('info', `[logout] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                logout(socket)
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('endClass', () => {
            try {
                logger.log('info', `[endClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const userId = socket.request.session.userId
                const classCode = socket.request.session.class

                database.get(
                    'SELECT * FROM classroom WHERE owner=? AND key=?',
                    [userId, classCode],
                    (err, classroom) => {
                        if (err) logger.log('error', err.stack)
                        else if (classroom) endClass(classroom.key)
                    }
                )
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('deleteClass', (classId) => {
            try {
                logger.log('info', `[deleteClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[deleteClass] classId=(${classId})`)

                database.get('SELECT * FROM classroom WHERE id=?', classId, (err, classroom) => {
                    try {
                        if (err) throw err

                        if (classroom) {
                            if (classInformation[classroom.key]) endClass(classroom.key)

                            database.run('DELETE FROM classroom WHERE id=?', classroom.id)
                            database.run('DELETE FROM classusers WHERE classId=?', classroom.id)
                            database.run('DELETE FROM poll_history WHERE class=?', classroom.id)
                        }

                        getOwnedClasses(socket.request.session.username)
                    } catch (err) {
                        logger.log('error', err.stack)
                    }
                })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('managerUpdate', () => {
            managerUpdate()
        })

        // Updates and stores poll history
        socket.on('cpUpdate', () => {
            logger.log('info', `[cpUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            cpUpdate();
        })

        // Displays previous polls
        socket.on('previousPollDisplay', (pollIndex) => {
            try {
                logger.log('info', `[previousPollDisplay] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[previousPollDisplay] pollIndex=(${pollIndex})`)

                advancedEmitToClass(
                    'previousPollData',
                    socket.request.session.class,
                    { classPermissions: classInformation[socket.request.session.class].permissions.controlPolls },
                    classInformation[socket.request.session.class].pollHistory[pollIndex].data
                )
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Moves to the next step
        socket.on('doStep', (index) => {
            try {
                logger.log('info', `[doStep] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[doStep] index=(${index})`)

                // send reload to whole class
                socket.broadcast.to(socket.request.session.class).emit('reload')
                classInformation[socket.request.session.class].currentStep++

                if (classInformation[socket.request.session.class].steps[index] !== undefined) {
                    // Creates a poll based on the step data
                    if (classInformation[socket.request.session.class].steps[index].type == 'poll') {
                        classInformation[socket.request.session.class].mode = 'poll'

                        if (classInformation[socket.request.session.class].poll.status == true) {
                            classInformation[socket.request.session.class].poll.responses = {}
                            classInformation[socket.request.session.class].poll.prompt = ''
                            classInformation[socket.request.session.class].poll.status = false
                        };

                        classInformation[socket.request.session.class].poll.status = true
                        // Creates an object for every answer possible the teacher is allowing
                        for (let i = 0; i < classInformation[socket.request.session.class].steps[index].responses; i++) {
                            if (classInformation[socket.request.session.class].steps[index].labels[i] == '' || classInformation[socket.request.session.class].steps[index].labels[i] == null) {
                                let letterString = 'abcdefghijklmnopqrstuvwxyz'
                                classInformation[socket.request.session.class].poll.responses[letterString[i]] = { answer: 'Answer ' + letterString[i], weight: 1 }
                            } else {
                                classInformation[socket.request.session.class].poll.responses[classInformation[socket.request.session.class].steps[index].labels[i]] = { answer: classInformation[socket.request.session.class].steps[index].labels[i], weight: classInformation[socket.request.session.class].steps[index].weights[i] }
                            }
                        }
                        classInformation[socket.request.session.class].poll.textRes = false
                        classInformation[socket.request.session.class].poll.prompt = classInformation[socket.request.session.class].steps[index].prompt
                        // Creates a new quiz based on step data
                    } else if (classInformation[socket.request.session.class].steps[index].type == 'quiz') {
                        classInformation[socket.request.session.class].mode = 'quiz'
                        questions = classInformation[socket.request.session.class].steps[index].questions
                        let quiz = new Quiz(questions.length, 100)
                        quiz.questions = questions
                        classInformation[socket.request.session.class].quiz = quiz
                        // Creates lesson based on step data
                    } else if (classInformation[socket.request.session.class].steps[index].type == 'lesson') {
                        classInformation[socket.request.session.class].mode = 'lesson'
                        let lesson = new Lesson(classInformation[socket.request.session.class].steps[index].date, classInformation[socket.request.session.class].steps[index].lesson)
                        classInformation[socket.request.session.class].lesson = lesson
                        database.run('INSERT INTO lessons(class, content, date) VALUES(?, ?, ?)',
                            [classInformation[socket.request.session.class].className, JSON.stringify(classInformation[socket.request.session.class].lesson), classInformation[socket.request.session.class].lesson.date], (err) => {
                                if (err) logger.log('error', err.stack)
                            }
                        )
                        classInformation[socket.request.session.class].poll.textRes = false
                        classInformation[socket.request.session.class].poll.prompt = classInformation[socket.request.session.class].steps[index].prompt
                        // Check this later, there's already a quiz if statement
                    } else if (classInformation[socket.request.session.class].steps[index].type == 'quiz') {
                        questions = classInformation[socket.request.session.class].steps[index].questions
                        quiz = new Quiz(questions.length, 100)
                        quiz.questions = questions
                        classInformation[socket.request.session.class].quiz = quiz
                        // Check this later, there's already a lesson if statement
                    } else if (classInformation[socket.request.session.class].steps[index].type == 'lesson') {
                        let lesson = new Lesson(classInformation[socket.request.session.class].steps[index].date, classInformation[socket.request.session.class].steps[index].lesson)
                        classInformation[socket.request.session.class].lesson = lesson
                        database.run('INSERT INTO lessons(class, content, date) VALUES(?, ?, ?)',
                            [classInformation[socket.request.session.class].className, JSON.stringify(classInformation[socket.request.session.class].lesson), classInformation[socket.request.session.class].lesson.date], (err) => {
                                if (err) logger.log('error', err.stack)
                            }
                        )
                    }

                    pollUpdate()
                    modeUpdate()
                    quizUpdate()
                    lessonUpdate()
                } else {
                    classInformation[socket.request.session.class].currentStep = 0
                }

                cpUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Deletes help ticket
        socket.on('deleteTicket', (student) => {
            try {
                logger.log('info', `[deleteTicket] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[deleteTicket] student=(${student})`)

                classInformation[socket.request.session.class].students[student].help = false

                logger.log('verbose', `[deleteTicket] user=(${JSON.stringify(classInformation[socket.request.session.class].students[student])})`)

                cpUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Changes the class mode
        socket.on('modechange', (mode) => {
            try {
                logger.log('info', `[modechange] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[modechange] mode=(${mode})`)

                classInformation[socket.request.session.class].mode = mode

                logger.log('verbose', `[modechange] classData=(${classInformation[socket.request.session.class]})`)

                modeUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('pluginUpdate', () => {
            logger.log('info', `[pluginUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            pluginUpdate()
        })

        socket.on('changePlugin', (id, name, url) => {
            try {
                logger.log('info', `[changePlugin] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[changePlugin] id=(${id}) name=(${name}) url=(${url})`)

                if (name) {
                    database.run(
                        'UPDATE plugins set name=? WHERE id=?',
                        [name, id],
                        (err) => {
                            if (err) logger.log('error', err)
                            else pluginUpdate()
                        }
                    )
                } else if (url) {
                    database.run('UPDATE plugins set url=? WHERE id=?', [url, id], (err) => {
                        if (err) logger.log('error', err)
                        else pluginUpdate()
                    })
                } else logger.log('critical', 'changePlugin called without name or url')
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('addPlugin', (name, url) => {
            try {
                logger.log('info', `[addPlugin] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[addPlugin] name=(${name}) url=(${url})`)

                database.get(
                    'SELECT * FROM classroom WHERE key=?',
                    [socket.request.session.class],
                    (err, classData) => {
                        try {
                            if (err) throw err

                            database.run(
                                'INSERT INTO plugins(name, url, classId) VALUES(?, ?, ?)',
                                [name, url, classData.id]
                            )
                            pluginUpdate()
                        } catch (err) {
                            logger.log('error', err.stack)
                        }
                    }
                )
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('removePlugin', (id) => {
            try {
                logger.log('info', `[removePlugin] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[removePlugin] id=(${id})`)

                database.run('DELETE FROM plugins WHERE id=?', [id])
                pluginUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('getOwnedClasses', (username) => {
            logger.log('info', `[getOwnedClasses] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            logger.log('info', `[getOwnedClasses] username=(${username})`)

            getOwnedClasses(username)
        })

        // sends the class code of the class a user is in
        socket.on('getUserClass', ({ username, api }) => {
            try {
                logger.log('info', `[getUserClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[getUserClass] username=(${username}) api=(${api})`)

                if (api) {
                    database.get('SELECT * FROM users WHERE API=?', [api], (err, userData) => {
                        try {
                            if (err) throw err
                            if (!userData) {
                                socket.emit('getUserClass', { error: 'not a valid API Key' })
                                return
                            }

                            let classCode = getUserClass(userData.username)

                            if (classCode instanceof Error) throw classCode

                            if (!classCode) socket.emit('getUserClass', { error: 'user is not logged in' })
                            else if (classCode == 'noClass') socket.emit('getUserClass', { error: 'user is not in a class' })
                            else socket.emit('getUserClass', className)
                        } catch (err) {
                            logger.log('error', err.stack)
                            socket.emit('getUserClass', { error: 'There was a server error try again.' })
                        }
                    })
                } else if (username) {
                    let classCode = getUserClass(username)

                    if (classCode instanceof Error) throw classCode

                    if (!classCode) socket.emit('getUserClass', { error: 'user is not logged in' })
                    else if (classCode == 'noClass') socket.emit('getUserClass', { error: 'user is not in a class' })
                    else socket.emit('getUserClass', className)
                } else socket.emit('getUserClass', { error: 'missing username or api key' })
            } catch (err) {
                logger.log('error', err.stack)
                socket.emit('getUserClass', { error: 'There was a server error try again.' })
            }
        })

        socket.on('classBannedUsersUpdate', () => {
            classBannedUsersUpdate()
        })

        socket.on('classBanUser', (user) => {
            try {
                logger.log('info', `[ban] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[ban] user=(${user})`)

                let classCode = socket.request.session.class
                logger.log('info', `[ban] classCode=(${classCode})`)

                if (!classCode || classCode == 'noClass') {
                    logger.log('info', '[ban] The user is not in a class.')
                    socket.emit('message', 'You are not in a class')
                    return
                }

                if (!user) {
                    logger.log('critical', '[ban] no username provided.')
                    socket.emit('message', 'No username provided. (Please contact the programmer)')
                    return
                }

                database.run('UPDATE classusers SET permissions = 0 WHERE classId = (SELECT id FROM classroom WHERE key=?) AND studentId = (SELECT id FROM users WHERE username=?)', [
                    socket.request.session.class,
                    user
                ], (err) => {
                    try {
                        if (err) throw err

                        if (classInformation[socket.request.session.class].students[user])
                            classInformation[socket.request.session.class].students[user].classPermissions = 0

                        classKickUser(user)
                        advancedEmitToClass('leaveSound', classCode, { api: true })
                        classBannedUsersUpdate()
                        cpUpdate()
                        socket.emit('message', `Banned ${user}`)
                    } catch (err) {
                        logger.log('error', err.stack)
                        socket.emit('message', 'There was a server error try again.')
                    }
                })
            } catch (err) {
                logger.log('error', err.stack)
                socket.emit('message', 'There was a server error try again.')
            }
        })

        socket.on('classUnbanUser', (user) => {
            try {
                logger.log('info', `[unban] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[unban] user=(${user})`)

                let classCode = socket.request.session.class
                logger.log('info', `[unban] classCode=(${classCode})`)

                if (!classCode || classCode == 'noClass') {
                    logger.log('info', '[unban] The user is not in a class.')
                    socket.emit('message', 'You are not in a class')
                    return
                }

                if (!user) {
                    logger.log('critical', '[unban] no username provided.')
                    socket.emit('message', 'No username provided. (Please contact the programmer)')
                    return
                }

                database.run('UPDATE classusers SET permissions = 1 WHERE classId = (SELECT id FROM classroom WHERE key=?) AND studentId = (SELECT id FROM users WHERE username=?)', [
                    socket.request.session.class,
                    user
                ], (err) => {
                    try {
                        if (err) throw err

                        if (classInformation[socket.request.session.class].students[user])
                            classInformation[socket.request.session.class].students[user].permissions = 1

                        classBannedUsersUpdate()
                        socket.emit('message', `Unbanned ${user}`)
                    } catch (err) {
                        logger.log('error', err.stack)
                        socket.emit('message', 'There was a server error try again.')
                    }
                })
            } catch (err) {
                logger.log('error', err.stack)
                socket.emit('message', 'There was a server error try again.')
            }
        })

        socket.on('setClassPermissionSetting', (permission, level) => {
            try {
                logger.log('info', `[setClassPermissionSetting] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[setClassPermissionSetting] permission=(${permission}) level=(${level})`)

                let classCode = socket.request.session.class
                classInformation[classCode].permissions[permission] = level
                database.run('UPDATE classroom SET permissions=? WHERE id=?', [JSON.stringify(classInformation[classCode].permissions), classInformation[classCode].id], (err) => {
                    try {
                        if (err) throw err

                        logger.log('info', `[setClassPermissionSetting] ${permission} set to ${level}`)
                        cpUpdate()
                    } catch (err) {
                        logger.log('error', err.stack)
                    }
                })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('deleteUser', async (userId) => {
            try {
                logger.log('info', `[deleteUser] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[deleteUser] userId=(${userId})`)

                const user = await new Promise((resolve, reject) => {
                    database.get('SELECT * FROM users WHERE id=?', userId, (err, user) => {
                        if (err) reject(err)
                        resolve(user)
                    })
                })
                if (!user) {
                    socket.emit('message', 'User not found')
                    return
                }

                if (userSockets[user.username])
                    logout(userSockets[user.username])

                try {
                    await runQuery('BEGIN TRANSACTION')

                    await Promise.all([
                        runQuery('DELETE FROM users WHERE id=?', userId),
                        runQuery('DELETE FROM classusers WHERE studentId=?', userId),
                        runQuery('DELETE FROM shared_polls WHERE userId=?', userId),
                    ])

                    await deleteCustomPolls(userId)
                    await deleteClassrooms(userId)

                    await runQuery('COMMIT')
                    await managerUpdate()
                    socket.emit('message', 'User deleted successfully')
                } catch (err) {
                    await runQuery('ROLLBACK')
                    throw err
                }
            } catch (err) {
                logger.log('error', err.stack)
                socket.emit('message', 'There was a server error try again.')
            }
        })

        socket.on('ipUpdate', () => {
            ipUpdate(null, socket.request.session.username)
        })

        socket.on('changeIp', (type, id, ip) => {
            try {
                logger.log('info', `[changeIp] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[changeIp] type=(${type}) id=(${id}) ip=(${ip})`)

                if (type != 'whitelist' && type != 'blacklist') {
                    logger.log('critical', 'invalid type')
                    socket.emit('message', 'Invalid Ip type')
                    return
                }

                database.get(`SELECT * FROM ip_${type} WHERE id=?`, id, (err, dbIp) => {
                    if (err) {
                        logger.log('error', err.stack)
                        socket.emit('message', 'There was a server error try again.')
                        return
                    }

                    if (!dbIp) {
                        socket.emit('message', 'Ip not found')
                        return
                    }


                    database.run(`UPDATE ip_${type} set ip=? WHERE id=?`, [ip, id], (err) => {
                        if (err) logger.log('error', err)
                        else {
                            if (type == 'whitelist') whitelistedIps[dbIp.id].ip = ip
                            else if (type == 'blacklist') blacklistedIps[dbIp.id].ip = ip


                            reloadPageByIp(type == 'whitelist', ip)
                            reloadPageByIp(type == 'whitelist', dbIp.ip)
                            ipUpdate(type)
                        }
                    })
                })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('addIp', (type, ip) => {
            logger.log('info', `[addIp] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            logger.log('info', `[addIp] type=(${type}) ip=(${ip})`)

            if (type != 'whitelist' && type != 'blacklist') {
                logger.log('critical', 'invalid type')
                socket.emit('message', 'Invalid Ip type')
                return
            }

            database.get(`SELECT * FROM ip_${type} WHERE ip=?`, ip, (err, dbIp) => {
                if (err) {
                    logger.log('error', err.stack)
                    socket.emit('message', 'There was a server error try again.')
                    return
                }

                if (dbIp) {
                    socket.emit('message', `IP already in ${type}`)
                    return
                }

                database.run(`INSERT INTO ip_${type} (ip) VALUES(?)`, [ip], (err) => {
                    if (err) {
                        logger.log('error', err.stack)
                        socket.emit('message', 'There was a server error try again.')
                        return
                    }

                    database.get(`SELECT * FROM ip_${type} WHERE ip=?`, ip, (err, dbIp) => {
                        if (err) {
                            logger.log('error', err.stack)
                            socket.emit('message', 'There was a server error try again.')
                            return
                        }

                        if (type == 'whitelist') whitelistedIps[dbIp.id] = dbIp
                        else if (type == 'blacklist') blacklistedIps[dbIp.id] = dbIp

                        reloadPageByIp(type != 'whitelist', ip)
                        ipUpdate(type)
                        socket.emit('message', `IP added to ${type}`)
                    })
                })
            })
        })

        socket.on('removeIp', (type, id) => {
            try {
                logger.log('info', `[removeIp] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[removeIp] type=(${type}) id=(${id})`)

                if (type != 'whitelist' && type != 'blacklist') {
                    logger.log('critical', 'invalid type')
                    socket.emit('message', 'Invalid Ip type')
                    return
                }

                database.get(`SELECT * FROM ip_${type} WHERE id=?`, id, (err, dbIp) => {
                    if (err) {
                        logger.log('error', err)
                        socket.emit('message', 'There was a server error try again.')
                        return
                    }

                    if (!dbIp) {
                        socket.emit('message', 'Ip not found')
                        return
                    }

                    database.run(`DELETE FROM ip_${type} WHERE id=?`, [id], (err) => {
                        if (err) {
                            logger.log('error', err)
                            socket.emit('message', 'There was a server error try again.')
                            return
                        }

                        reloadPageByIp(type != 'whitelist', dbIp.ip)
                        if (type == 'whitelist') delete whitelistedIps[id]
                        else if (type == 'blacklist') delete blacklistedIps[id]
                        ipUpdate(type)
                    })
                })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('toggleIpList', (type) => {
            logger.log('info', `[toggleIpList] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            logger.log('info', `[toggleIpList] type=(${type})`)

            if (type != 'whitelist' && type != 'blacklist') {
                logger.log('critical', 'invalid type')
                socket.emit('message', 'Invalid Ip type')
                return
            }

            settings[`${type}Active`] = !settings[`${type}Active`]
            fs.writeFileSync('./settings.json', JSON.stringify(settings))

            let ipList
            if (type == 'whitelist') ipList = whitelistedIps
            else if (type == 'blacklist') ipList = blacklistedIps

            for (let ip of Object.values(ipList)) {
                reloadPageByIp(type != 'whitelist', ip.ip)
            }
            ipUpdate(type)
        })

        socket.on('saveTags', (studentId, tags, username) => {
            //Save the tags to the students tag element in their object
            //Then save their tags to the database
            try {
                logger.log('info', `[saveTags] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[saveTags] studentId=(${studentId}) tags=(${JSON.stringify(tags)})`)
                classInformation[socket.request.session.class].students[username].tags = tags.toString()
                database.get('SELECT tags FROM users WHERE id=?', [studentId], (err, row) => {
                    if (err) {
                        logger.log('error', err)
                        socket.emit('message', 'There was a server error try again.')
                        return
                    }
                    if (row) {
                        // Row exists, update it
                        database.run('UPDATE users SET tags=? WHERE id=?', [tags.toString(), studentId], (err) => {
                            if (err) {
                                logger.log('error', err)
                                socket.emit('message', 'There was a server error try again.')
                                return
                            }
                        });
                    } else {
                        socket.send('message', 'User not found')
                    }
                });
            }
            catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('newTag', (tagName) => {
            //Add a new tag to the database
            try {
                if (tagName == '') return;
                classInformation[socket.request.session.class].tagNames.push(tagName);
                var newTotalTags = "";
                for (let i = 0; i < classInformation[socket.request.session.class].tagNames.length; i++) {
                    newTotalTags += classInformation[socket.request.session.class].tagNames[i] + ", ";
                };
                newTotalTags = newTotalTags.split(", ");
                newTotalTags.pop();
                database.get('SELECT * FROM classroom WHERE name = ?', [classInformation[socket.request.session.class].className], (err, row) => {
                    if (err) {
                        logger.log(err.stack);
                    }
                    if (row) {
                        database.run('UPDATE classroom SET tags = ? WHERE name = ?', [newTotalTags.toString(), classInformation[socket.request.session.class].className], (err) => {
                            if (err) {
                                logger.log(err.stack);
                            };
                        });
                    } else {
                        socket.send('message', 'Class not found')
                    };
                });
            }
            catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('removeTag', (tagName) => {
            try {
                //Find the tagName in the array of tagnames from the database
                //If the tagname is not there, socket.send('message', 'Tag not found') and return
                //If the tagname is there, remove it from the array and update the database
                var index = classInformation[socket.request.session.class].tagNames.indexOf(tagName);
                if (index > -1) {
                    classInformation[socket.request.session.class].tagNames.splice(index, 1);
                } else {
                    socket.send('message', 'Tag not found')
                    return;
                }
                //Now remove all instances of the tag from the students' tags
                for (let student of Object.values(classInformation[socket.request.session.class].students)) {
                    if (student.classPermissions == 0 || student.classPermissions >= 5) continue;
                    var studentTags = student.tags.split(",");
                    var studentIndex = studentTags.indexOf(tagName);
                    if (studentIndex > -1) {
                        studentTags.splice(studentIndex, 1);
                    }
                    student.tags = studentTags.toString();
                    database.get('SELECT * FROM users WHERE username = ?', [student.username], (err, row) => {
                        if (err) {
                            logger.log(err.stack);
                        }
                        if (row) {
                            database.run('UPDATE users SET tags = ? WHERE username = ?', [studentTags.toString(), student.username], (err) => {
                                if (err) {
                                    logger.log(err.stack);
                                };
                            });
                        } else {
                            socket.send('message', 'User not found')
                        };
                    });
                    database.get('SELECT tags FROM classroom WHERE name = ?', [classInformation[socket.request.session.class].className], (err, row) => {
                        if (err) {
                            logger.log(err.stack);
                        }
                        //Set the tags in the database to a variable
                        //Remove the tag from the variable
                        //Update the database with the new variable
                        if (row) {
                            var newTotalTags = row.tags;
                            newTotalTags = newTotalTags.split(",");
                            var tagIndex = newTotalTags.indexOf(tagName);
                            if (tagIndex > -1) {
                                newTotalTags.splice(tagIndex, 1);
                            }
                            database.run('UPDATE classroom SET tags = ? WHERE name = ?', [newTotalTags.toString(), classInformation[socket.request.session.class].className], (err) => {
                                if (err) {
                                    logger.log(err.stack);
                                };
                            });
                        } else {
                            socket.send('message', 'Class not found')
                        };
                    })
                };
            }
            catch (err) {
                logger.log('error', err.stack);
            }
        });

        socket.on("approvePasswordChange", (changeApproval, username, newPassword) => {
            try {
                if (changeApproval) {
                    let passwordCrypt = encrypt(newPassword);
                    let passwordCryptString = JSON.stringify(passwordCrypt);
                    database.run("UPDATE users SET password = ? WHERE username = ?", [passwordCryptString, username], (err) => {
                        if (err) {
                            logger.log("error", err.stack);
                        };
                    });
                };
            } catch (err) {
                logger.log("error", err.stack);
            };
        });

        socket.on("classPoll", (poll) => {
            try {
                let userId = socket.request.session.userId
                database.get('SELECT seq AS nextPollId from sqlite_sequence WHERE name = "custom_polls"', (err, nextPollId) => {
                    try {
                        if (err) throw err
                        if (!nextPollId) logger.log('critical', '[savePoll] nextPollId not found')

                        nextPollId = nextPollId.nextPollId + 1

                        database.run('INSERT INTO custom_polls (owner, name, prompt, answers, textRes, blind, weight, public) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
                            userId,
                            poll.name,
                            poll.prompt,
                            JSON.stringify(poll.answers),
                            poll.textRes,
                            poll.blind,
                            poll.weight,
                            poll.public
                        ], (err) => {
                            try {
                                if (err) throw err

                                classInformation[socket.request.session.class].students[socket.request.session.username].ownedPolls.push(nextPollId)
                                socket.emit('message', 'Poll saved successfully!')
                                customPollUpdate(socket.request.session.username)
                                socket.emit("classPollSave", nextPollId);
                            } catch (err) {
                                logger.log('error', err.stack);
                            }
                        })
                    } catch (err) {
                        logger.log('error', err.stack);
                    }
                })
            } catch (err) {
                logger.log("error", err.stack);
            }
        })

        socket.on('vbTimer', () => {
            let classData = classInformation[socket.request.session.class];
            let username = socket.request.session.username

            advancedEmitToClass('vbTimer', socket.request.session.class, {
                classPermissions: CLASS_SOCKET_PERMISSIONS.vbTimer,
                username
            }, classData.timer);
        })

        socket.on("timer", (startTime, active, sound) => {
            //This handles the server side timer
            try {
                let classData = classInformation[socket.request.session.class];

                startTime = Math.round(startTime * 60)

                classData.timer.startTime = startTime
                classData.timer.timeLeft = startTime + 1
                classData.timer.active = active
                classData.timer.sound = sound

                cpUpdate(socket.request.session.class)
                if (active) {
                    //run the function once instantly
                    timer(sound, active)
                    //save a clock in the class data, that way it saves when the page is refreshed
                    runningTimers[socket.request.session.class] = setInterval(() => timer(sound, active), 1000);
                } else {
                    //if the timer is not active, clear the interval
                    clearInterval(runningTimers[socket.request.session.class]);
                    runningTimers[socket.request.session.class] = null;

                    timer(sound, active)
                }
            } catch (err) {
                logger.log("error", err.stack);
            }
        })

        socket.on("timerOn", () => {
            socket.emit("timerOn", classInformation[socket.request.session.class].timer.active);
        })

    })
}

module.exports = {
    managerUpdate,
    advancedEmitToClass,
    initSocketRoutes,
    io
}