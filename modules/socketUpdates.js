const { whitelistedIps, blacklistedIps } = require("./authentication");
const { classInformation } = require("./class/classroom");
const { settings } = require("./config");
const { database, dbGetAll, dbRun } = require("./database");
const { logger } = require("./logger");
const { TEACHER_PERMISSIONS, CLASS_SOCKET_PERMISSIONS, GUEST_PERMISSIONS } = require("./permissions");
const { io } = require("./webServer");

const runningTimers = {}
const rateLimits = {}
const userSockets = {}
let currentPoll = 0

// Get the current poll id
database.get('SELECT MAX(id) FROM poll_history', (err, pollHistory) => {
    if (err) {
        logger.log('error', err.stack)
    } else {
        // Set the current poll id to the maximum id minus one since the database starts poll ids at 1
        currentPoll = pollHistory['MAX(id)'] - 1
    }
})

// Socket update events
const PASSIVE_SOCKETS = [
	'pollUpdate',
	'modeUpdate',
	'quizUpdate',
	'lessonUpdate',
	'managerUpdate',
	'ipUpdate',
	'vbUpdate',
	'cpUpdate',
	'pluginUpdate',
	'customPollUpdate',
	'classBannedUsersUpdate'
]

/**
 * Emits an event to sockets based on user permissions
 * @param {string} event - The event to emit
 * @param {string} classId - The id of the class
 * @param {{permissions?: number, classPermissions?: number, api?: boolean, email?: string}} options - The options object
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
    let [users, classrooms] = await Promise.all([
        new Promise((resolve, reject) => {
            database.all('SELECT id, email, permissions, displayName FROM users', (err, users) => {
                if (err) reject(new Error(err))
                else {
                    users = users.reduce((tempUsers, tempUser) => {
                        tempUsers[tempUser.email] = tempUser
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

class SocketUpdates {
    constructor(socket) {
        this.socket = socket;
    }

    classPermissionUpdate(classId = this.socket.request.session.classId) {
        try {
            logger.log('info', `[classPermissionUpdate] classId=(${classId})`)
            const classData = classInformation.classrooms[classId]
            if (!classData) return; // If the class is not loaded, then do not update the class permissions

            let cpPermissions = Math.min(
                classData.permissions.controlPolls,
                classData.permissions.manageStudents,
                classData.permissions.manageClass
            )

            advancedEmitToClass('cpUpdate', classId, { classPermissions: cpPermissions }, classData)
            this.customPollUpdate();
        } catch (err) {
            logger.log('error', err.stack);
        }
    }
    
    virtualBarUpdate(classId = this.socket.request.session.classId) {
        try {
            logger.log('info', `[virtualBarUpdate] classId=(${classId})`)
            if (!classId) return; // If a class id is not provided then deny the

            const classData = structuredClone(classInformation.classrooms[classId])
            logger.log('verbose', `[virtualBarUpdate] status=(${classData.poll.status}) totalResponses=(${Object.keys(classData.students).length}) textRes=(${classData.poll.textRes}) prompt=(${classData.poll.prompt}) weight=(${classData.poll.weight}) blind=(${classData.poll.blind})`)

            let totalResponses = 0;
            let totalStudentsIncluded = [];
            let totalStudentsExcluded = [];
            let responses = {};

            for (let student of Object.values(classData.students)) {
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

                // Check if the student's checkbox was checked
                if (classData.poll.studentBoxes.includes(student.email)) {
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

            advancedEmitToClass('vbUpdate', classId, { classPermissions: CLASS_SOCKET_PERMISSIONS.vbUpdate }, {
                status: classData.poll.status,
                totalResponders: Object.keys(classData.students).length - totalStudentsExcluded.length,
                totalResponses: totalResponses,
                polls: responses,
                textRes: classData.poll.textRes,
                multiRes: classData.poll.multiRes,
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

    pollUpdate(classId = this.socket.request.session.classId) {
        try {
            logger.log('info', `[pollUpdate] classId=(${classId})`)
            logger.log('verbose', `[pollUpdate] poll=(${JSON.stringify(classInformation.classrooms[classId].poll)})`)
    
            advancedEmitToClass(
                'pollUpdate',
                classId,
                { classPermissions: CLASS_SOCKET_PERMISSIONS.pollUpdate },
                classInformation.classrooms[classId].poll
            )

        } catch (err) {
            logger.log('error', err.stack);
        }
    }
    
    modeUpdate(classId = this.socket.request.session.classId) {
        try {
            logger.log('info', `[modeUpdate] classId=(${classId})`)
            logger.log('verbose', `[modeUpdate] mode=(${classInformation.classrooms[classId].mode})`)
    
            advancedEmitToClass(
                'modeUpdate',
                classId,
                { classPermissions: CLASS_SOCKET_PERMISSIONS.modeUpdate },
                classInformation.classrooms[classId].mode
            )
        } catch (err) {
            logger.log('error', err.stack);
        }
    }
    
    quizUpdate(classId = this.socket.request.session.classId) {
        try {
            logger.log('info', `[quizUpdate] classId=(${classId})`)
            logger.log('verbose', `[quizUpdate] quiz=(${JSON.stringify(classInformation.classrooms[classId].quiz)})`)
    
            advancedEmitToClass(
                'quizUpdate',
                classId,
                { classPermissions: CLASS_SOCKET_PERMISSIONS.quizUpdate },
                classInformation.classrooms[classId].quiz
            )
        } catch (err) {
            logger.log('error', err.stack);
        }
    }
    
    lessonUpdate(classId = this.socket.request.session.classId) {
        try {
            logger.log('info', `[lessonUpdate] classId=(${classId})`)
            logger.log('verbose', `[lessonUpdate] lesson=(${JSON.stringify(classInformation.classrooms[classId].lesson)})`)
    
            advancedEmitToClass(
                'lessonUpdate',
                classId,
                { classPermissions: CLASS_SOCKET_PERMISSIONS.lessonUpdate },
                classInformation.classrooms[classId].lesson
            )
        } catch (err) {
            logger.log('error', err.stack);
        }
    }
    
    pluginUpdate(classId = this.socket.request.session.classId) {
        try {
            logger.log('info', `[pluginUpdate] classId=(${classId})`)
    
            database.all(
                'SELECT plugins.id, plugins.name, plugins.url FROM plugins JOIN classroom ON classroom.id=?',
                [classId],
                (err, plugins) => {
                    try {
                        if (err) throw err
    
                        logger.log('verbose', `[pluginUpdate] plugins=(${JSON.stringify(plugins)})`)
    
                        advancedEmitToClass(
                            'pluginUpdate',
                            classId,
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
    
    customPollUpdate(email) {
        try {
            // Ignore any requests which do not have an associated socket with the email
            if (!email) email = this.socket.request.session.email;
            if (!userSockets[email]) {
                return;
            }

            logger.log('info', `[customPollUpdate] email=(${email})`)
            let userSession = userSockets[email].request.session
            let userSharedPolls = classInformation.classrooms[userSession.classId].students[userSession.email].sharedPolls
            let userOwnedPolls = classInformation.classrooms[userSession.classId].students[userSession.email].ownedPolls
            let userCustomPolls = Array.from(new Set(userSharedPolls.concat(userOwnedPolls)))
            let classroomPolls = structuredClone(classInformation.classrooms[userSession.classId].sharedPolls)
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
    
            database.all('SELECT users.email FROM classroom JOIN classusers ON classusers.classId = classroom.id AND classusers.permissions = 0 JOIN users ON users.id = classusers.studentId WHERE classusers.classId=?', classId, (err, bannedStudents) => {
                try {
                    if (err) throw err
    
                    bannedStudents = bannedStudents.map((bannedStudent) => bannedStudent.email)
    
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
    classKickUser(email, classId = this.socket.request.session.classId, exitClass = true) {
        try {
            logger.log('info', `[classKickUser] email=(${email}) classId=(${classId}) exitClass=${exitClass}`);

            // Remove user from class session
            classInformation.users[email].classPermissions = null;
            classInformation.users[email].activeClasses = classInformation.users[email].activeClasses.filter((activeClass) => activeClass != classId);
            setClassOfApiSockets(classInformation.users[email].API, null);
            
            // Mark the user as offline in the class and remove them from the active classes if the classroom is loaded into memory
            if (classInformation.classrooms[classId]) {
                // If the student is a guest, then remove them from the classroom entirely
                const student = classInformation.classrooms[classId].students[email];
                if (student.isGuest) {
                    delete classInformation.classrooms[classId].students[email];
                } else {
                    student.activeClasses = classInformation.classrooms[classId].students[email].activeClasses.filter((activeClass) => activeClass != classId);
                    student.tags = student.tags ? student.tags + ',Offline' : 'Offline';
                }
            }
            logger.log('verbose', `[classKickUser] classInformation=(${JSON.stringify(classInformation)})`);

            // If exitClass is true, then remove the user from the classroom entirely
            if (exitClass) {
                database.run('DELETE FROM classusers WHERE studentId=? AND classId=?', [classInformation.users[email].id, classId], (err) => {});
                delete classInformation.classrooms[classId].students[email];
            }

            // Update the control panel
            this.classPermissionUpdate(classId);
            this.virtualBarUpdate(classId);

            // If the user is logged in, then handle the user's session
            if (userSockets[email]) {
                userSockets[email].leave(`class-${classId}`);
                userSockets[email].request.session.classId = null;
                userSockets[email].request.session.save();
                userSockets[email].emit('reload');
            }            
        } catch (err) {
            logger.log('error', err.stack);
        }
    }

    classKickStudents(classId) {
        try {
            logger.log('info', `[classKickStudents] classId=(${classId})`)

            for (let email of Object.keys(classInformation.classrooms[classId].students)) {
                if (classInformation.classrooms[classId].students[email].classPermissions < TEACHER_PERMISSIONS) {
                    this.classKickUser(email, classId);
                }
            }
        } catch (err) {
            logger.log('error', err.stack);
        }
    }
    
    logout(socket) {
        const email = socket.request.session.email
        const userId = socket.request.session.userId
        const classId = socket.request.session.classId

        // If the user is in a class, then get the class name and mark the user as inactive
        let className = null
        if (classId) {
            className = classInformation.classrooms[classId].className
            classInformation.users[email].activeClasses = classInformation.users[email].activeClasses.filter((activeClass) => activeClass != classId);
            classInformation.users[email].classPermissions = null;
        }

        socket.request.session.destroy((err) => {
            try {
                if (err) throw err
    
                delete userSockets[email]
                socket.leave(`class-${classId}`)
                socket.emit('reload')

                // If the user is in a class, then remove the user from the class, update the class permissions, and virtual bar
                if (className) {
                    const student = classInformation.classrooms[classId].students[email];
                    if (!student) return;
                    if (student.isGuest) {
                        // Remove the guest from the class
                        delete classInformation.classrooms[classId].students[email];
                    } else {
                        // Mark the student as offline
                        student.activeClasses = classInformation.classrooms[classId].students[email].activeClasses.filter((activeClass) => activeClass != classId);
                        student.tags = student.tags ? student.tags + ',Offline' : 'Offline';
                    }
                    
                    // Update class permissions and virtual bar
                    this.classPermissionUpdate(classId)
                    this.virtualBarUpdate(classId)
                }
    
                database.get(
                    'SELECT * FROM classroom WHERE owner=? AND id=?',
                    [userId, classId],
                    (err, classroom) => {
                        if (err) {
                            logger.log('error', err.stack)
                        }

                        if (classroom) {
                            this.endClass(classroom.id);
                        }
                    }
                )
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
    
    async endPoll(classId = this.socket.request.session.classId) {
        try {
            logger.log('info', `[endPoll] ip=(${this.socket.handshake.address}) session=(${JSON.stringify(this.socket.request.session)})`)
    
            let data = { prompt: '', names: [], letter: [], text: [] }
            currentPoll += 1
    
            let dateConfig = new Date()
            let date = `${dateConfig.getMonth() + 1}/${dateConfig.getDate()}/${dateConfig.getFullYear()}`
    
            data.prompt = classInformation.classrooms[classId].poll.prompt
            data.responses = classInformation.classrooms[classId].poll.responses
            data.multiRes = classInformation.classrooms[classId].poll.multiRes
            data.blind = classInformation.classrooms[classId].poll.blind
            data.isTextResponse = classInformation.classrooms[classId].poll.text

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
    
            logger.log('verbose', `[endPoll] classData=(${JSON.stringify(classInformation.classrooms[classId])})`)
        } catch (err) {
            logger.log('error', err.stack);
        }
    }
    
    async clearPoll(classId = this.socket.request.session.classId) {
        if (classInformation.classrooms[classId].poll.status) {
            await this.endPoll()
        }
    
        classInformation.classrooms[classId].poll.responses = {};
        classInformation.classrooms[classId].poll.prompt = "";
        classInformation.classrooms[classId].poll = {
            status: false,
            responses: {},
            textRes: false,
            prompt: "",
            weight: 1,
            blind: false,
            requiredTags: [],
            studentBoxes: [],
            allowedResponses: [],
        };
    }

    async startClass(classId) {
        try {
            logger.log('info', `[startClass] classId=(${classId})`);
            await advancedEmitToClass('startClassSound', classId, { api: true });

            // Activate the class and send the class active event
            classInformation.classrooms[classId].isActive = true;
            advancedEmitToClass('isClassActive', classId, { classPermissions: CLASS_SOCKET_PERMISSIONS.isClassActive }, classInformation.classrooms[classId].isActive);

            logger.log('verbose', `[startClass] classInformation=(${JSON.stringify(classInformation)})`);
        } catch (err) {
            logger.log('error', err.stack);
        }
    }
    
    async endClass(classId) {
        try {
            logger.log('info', `[endClass] classId=(${classId})`);
            await advancedEmitToClass('endClassSound', classId, { api: true });

            // Deactivate the class and send the class active event
            classInformation.classrooms[classId].isActive = false;
            advancedEmitToClass('isClassActive', classId, { classPermissions: CLASS_SOCKET_PERMISSIONS.isClassActive }, classInformation.classrooms[classId].isActive);

            logger.log('verbose', `[endClass] classInformation=(${JSON.stringify(classInformation)})`);
        } catch (err) {
            logger.log('error', err.stack);
        }
    }
    
    getOwnedClasses(email) {
        try {
            logger.log('info', `[getOwnedClasses] email=(${email})`)
    
            database.all('SELECT name, id FROM classroom WHERE owner=?',
                [userSockets[email].request.session.userId], (err, ownedClasses) => {
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
                'SELECT pollId, userId, email FROM shared_polls LEFT JOIN users ON users.id = shared_polls.userId WHERE pollId=?',
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

    async deleteCustomPolls(userId) {
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
    
    async deleteClassrooms(userId) {
        try {
            const classrooms = await dbGetAll('SELECT * FROM classroom WHERE owner=?', userId)
            if (classrooms.length == 0) return

            await dbRun('DELETE FROM classroom WHERE owner=?', classrooms[0].owner)
            for (let classroom of classrooms) {
                if (classInformation.classrooms[classroom.id]) {
                    this.endClass(classroom.key. classroom.id)
                }

                await Promise.all([
                    dbRun('DELETE FROM classusers WHERE classId=?', classroom.id),
                    dbRun('DELETE FROM class_polls WHERE classId=?', classroom.id),
                    dbRun('DELETE FROM plugins WHERE classId=?', classroom.id),
                    dbRun('DELETE FROM lessons WHERE class=?', classroom.id)
                ])
            }
        } catch (err) {
            throw err
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
    currentPoll,
    PASSIVE_SOCKETS,

    // Socket functions
    advancedEmitToClass,
    setClassOfApiSockets,
    managerUpdate,
    SocketUpdates
};
