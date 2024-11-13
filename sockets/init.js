// @TODO: Separate all of these into different routes

const { database, runQuery } = require("../modules/database")
const { classInformation } = require("../modules/class")
const { logger } = require("../modules/logger")
const { camelCaseToNormal } = require("../modules/util");
const { CLASS_SOCKET_PERMISSIONS, GLOBAL_SOCKET_PERMISSIONS, CLASS_SOCKET_PERMISSION_SETTINGS } = require("../modules/permissions");
const { userSockets, SocketUpdates, advancedEmitToClass, managerUpdate } = require("../modules/socketUpdates");
const { io } = require("../modules/webServer");
const fs = require("fs");

// Handles the websocket communications
function initSocketRoutes() {
    io.on('connection', async (socket) => {
        const socketUpdates = new SocketUpdates(socket);

        // Import middleware
        const socketMiddlewareFiles = fs.readdirSync("./sockets/middleware").filter(file => file.endsWith('.js'));
        const middlewares = socketMiddlewareFiles.map(file => require(`./middleware/${file}`));
        middlewares.sort((a, b) => a.order - b.order); // Sort the middleware functions by their order
        for (const middleware of middlewares) {
            middleware.run(socket, socketUpdates);
        }
        
        // Import socket routes
        const socketRouteFiles = fs.readdirSync('./sockets').filter(file => file.endsWith('.js'));
        for (const socketRouteFile of socketRouteFiles) {
            // Skip as this is the file initializing all of them
            if (socketRouteFile == "init.js") {
                continue;
            }

            const route = require(`./${socketRouteFile}`);
            route.run(socket, socketUpdates);
        }

        socket.on('setPublicPoll', (pollId, value) => {
            try {
                logger.log('info', `[setPublicPoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[setPublicPoll] pollId=(${pollId}) value=(${value})`)

                database.run('UPDATE custom_polls set public=? WHERE id=?', [value, pollId], (err) => {
                    try {
                        if (err) throw err

                        for (let userSocket of Object.values(userSockets)) {
                            socketUpdates.customPollUpdate(userSocket.request.session.username)
                        }
                    } catch (err) {
                        logger.log('error', err.stack);
                    }
                })
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('logout', () => {
            try {
                logger.log('info', `[logout] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                socketUpdates.logout(socket)
            } catch (err) {
                logger.log('error', err.stack)
            }
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

                    socketUpdates.pollUpdate()
                    socketUpdates.modeUpdate()
                    socketUpdates.quizUpdate()
                    socketUpdates.lessonUpdate()
                } else {
                    classInformation[socket.request.session.class].currentStep = 0
                }

                socketUpdates.classPermissionUpdate()
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

                socketUpdates.modeUpdate()
            } catch (err) {
                logger.log('error', err.stack)
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
                        socketUpdates.classPermissionUpdate()
                    } catch (err) {
                        logger.log('error', err.stack)
                    }
                })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    })
}

module.exports = {
    initSocketRoutes
}