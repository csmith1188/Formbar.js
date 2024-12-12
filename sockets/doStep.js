const { classInformation } = require("../modules/class")
const { Quiz, Lesson } = require("../modules/classwork")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")

module.exports = {
    run(socket, socketUpdates) {
        // Moves to the next step
        socket.on('doStep', async (index) => {
            try {
                logger.log('info', `[doStep] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[doStep] index=(${index})`)

                // send reload to whole class
                socket.broadcast.to(socket.request.session.class).emit('reload')
                classInformation[socket.request.session.class].currentStep++

                // @TODO: take a look at
                console.log("STEP", socket.request.session.classId);
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
                    } else if (classInformation[socket.request.session.class].steps[index].type == 'quiz') {
                        // Creates a new quiz based on step data
                        classInformation[socket.request.session.class].mode = 'quiz'
                        questions = classInformation[socket.request.session.class].steps[index].questions
                        
                        const quiz = new Quiz(questions.length, 100)
                        quiz.questions = questions
                        classInformation[socket.request.session.class].quiz = quiz
                    } else if (classInformation[socket.request.session.class].steps[index].type == 'lesson') {
                        // Creates lesson based on step data
                        classInformation[socket.request.session.class].mode = 'lesson'
                        
                        const lesson = new Lesson(classInformation[socket.request.session.class].steps[index].date, classInformation[socket.request.session.class].steps[index].lesson)
                        classInformation[socket.request.session.class].lesson = lesson
                        database.run('INSERT INTO lessons(class, content, date) VALUES(?, ?, ?)',
                            [classInformation[socket.request.session.class].className, JSON.stringify(classInformation[socket.request.session.class].lesson), classInformation[socket.request.session.class].lesson.date], (err) => {
                                if (err) logger.log('error', err.stack)
                            }
                        )
                        classInformation[socket.request.session.class].poll.textRes = false
                        classInformation[socket.request.session.class].poll.prompt = classInformation[socket.request.session.class].steps[index].prompt
                    } else if (classInformation[socket.request.session.class].steps[index].type == 'quiz') {
                        // Check this later, there's already a quiz if statement
                        questions = classInformation[socket.request.session.class].steps[index].questions
                        
                        const quiz = new Quiz(questions.length, 100)
                        quiz.questions = questions
                        classInformation[socket.request.session.class].quiz = quiz
                    } else if (classInformation[socket.request.session.class].steps[index].type == 'lesson') {
                        // Check this later, there's already a lesson if statement
                        
                        const lesson = new Lesson(classInformation[socket.request.session.class].steps[index].date, classInformation[socket.request.session.class].steps[index].lesson)
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
    }
}