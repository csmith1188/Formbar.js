// @TODO: Separate all of these into different routes

const { database } = require("../modules/database")
const { classInformation } = require("../modules/class")
const { logger } = require("../modules/logger")
const { GUEST_PERMISSIONS, TEACHER_PERMISSIONS, CLASS_SOCKET_PERMISSIONS, GLOBAL_SOCKET_PERMISSIONS, CLASS_SOCKET_PERMISSION_SETTINGS } = require("../modules/permissions");
const { settings } = require("../modules/config");
const { ipUpdate, getOwnedClasses, runningTimers, rateLimits, userSockets, virtualBarUpdate } = require("../modules/socketUpdates");
const { io } = require("../modules/webServer");
const fs = require("fs");

let currentPoll = 0

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

function camelCaseToNormal(str) {
	let result = str.replace(/([A-Z])/g, " $1")
	result = result.charAt(0).toUpperCase() + result.slice(1)
	return result
}

function runQuery(query, params) {
	return new Promise((resolve, reject) => {
		database.run(query, params, (err) => {
			if (err) reject(new Error(err))
			else resolve()
		})
	})
}

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

/**
 * Sets the class code for all sockets in a specific API.
 * If no class code is provided, the default value is 'noClass'.
 *
 * @param {string} api - The API identifier.
 * @param {string} [classCode='noClass'] - The class code to set.
 */
async function setClassOfApiSockets(api, classCode) {
	logger.log('verbose', `[setClassOfApiSockets] api=(${api}) classCode=(${classCode})`);

	const sockets = await io.in(`api-${api}`).fetchSockets()
	for (let socket of sockets) {
		socket.leave(`class-${socket.request.session.class}`)

		socket.request.session.class = classCode || 'noClass'
		socket.request.session.save()

		socket.join(`class-${socket.request.session.class}`)
		socket.emit('setClass', socket.request.session.class)
	}
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

        // Rate limiter
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

        // Permission check
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

        const socketRouteFiles = fs.readdirSync('./sockets').filter(file => file.endsWith('.js'));
        for (const socketRouteFile of socketRouteFiles) {
            // Skip as this is the file initializing all of them
            if (socketRouteFile == "init.js") {
                continue;
            }

            const route = require(`./${socketRouteFile}`);
            route.run(socket);
        }

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

                classPermissionUpdate()
                virtualBarUpdate()
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
                virtualBarUpdate();
                classPermissionUpdate();
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('endPoll', async () => {
            try {
                await endPoll();
                pollUpdate();
                classPermissionUpdate();
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
            logger.log('info', `[virtualBarUpdate] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

            virtualBarUpdate()
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

                classPermissionUpdate()
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
                classPermissionUpdate()
                virtualBarUpdate()
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

                classPermissionUpdate()
                virtualBarUpdate()
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
                classPermissionUpdate(classCode)
                virtualBarUpdate(classCode)
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
                classPermissionUpdate(classCode)
                virtualBarUpdate(classCode)
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
                classPermissionUpdate(classCode)
                virtualBarUpdate(classCode)

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

            classPermissionUpdate();
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

                classPermissionUpdate()
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

                classPermissionUpdate()
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
                        classPermissionUpdate()
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
                        classPermissionUpdate()
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

                if (userSockets[user.username]) {
                    logout(userSockets[user.username])
                }

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

                classPermissionUpdate(socket.request.session.class)
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
    setClassOfApiSockets,

    initSocketRoutes
}