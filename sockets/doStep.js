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
                classInformation.classrooms[socket.request.session.classId].currentStep++

                if (classInformation.classrooms[socket.request.session.classId].steps[index] !== undefined) {
                    // Creates a poll based on the step data
                    if (classInformation.classrooms[socket.request.session.classId].steps[index].type == 'poll') {
                        classInformation.classrooms[socket.request.session.classId].mode = 'poll'
                        if (classInformation.classrooms[socket.request.session.classId].poll.status == true) {
                            classInformation.classrooms[socket.request.session.classId].poll.responses = {}
                            classInformation.classrooms[socket.request.session.classId].poll.prompt = ''
                            classInformation.classrooms[socket.request.session.classId].poll.status = false
                        };

                        classInformation.classrooms[socket.request.session.classId].poll.status = true
                        
                        // Creates an object for every answer possible the teacher is allowing
                        for (let i = 0; i < classInformation.classrooms[socket.request.session.classId].steps[index].responses; i++) {
                            if (classInformation.classrooms[socket.request.session.classId].steps[index].labels[i] == '' || classInformation.classrooms[socket.request.session.classId].steps[index].labels[i] == null) {
                                let letterString = 'abcdefghijklmnopqrstuvwxyz'
                                classInformation.classrooms[socket.request.session.classId].poll.responses[letterString[i]] = { answer: 'Answer ' + letterString[i], weight: 1 }
                            } else {
                                classInformation.classrooms[socket.request.session.classId].poll.responses[classInformation.classrooms[socket.request.session.classId].steps[index].labels[i]] = { answer: classInformation.classrooms[socket.request.session.classId].steps[index].labels[i], weight: classInformation.classrooms[socket.request.session.classId].steps[index].weights[i] }
                            }
                        }
                        classInformation.classrooms[socket.request.session.classId].poll.textRes = false
                        classInformation.classrooms[socket.request.session.classId].poll.prompt = classInformation.classrooms[socket.request.session.classId].steps[index].prompt
                    } else if (classInformation.classrooms[socket.request.session.classId].steps[index].type == 'quiz') {
                        // Creates a new quiz based on step data
                        classInformation.classrooms[socket.request.session.classId].mode = 'quiz'
                        questions = classInformation.classrooms[socket.request.session.classId].steps[index].questions
                        
                        const quiz = new Quiz(questions.length, 100)
                        quiz.questions = questions
                        classInformation.classrooms[socket.request.session.classId].quiz = quiz
                    } else if (classInformation.classrooms[socket.request.session.classId].steps[index].type == 'lesson') {
                        // Creates lesson based on step data
                        classInformation.classrooms[socket.request.session.classId].mode = 'lesson'
                        
                        const lesson = new Lesson(classInformation.classrooms[socket.request.session.classId].steps[index].date, classInformation.classrooms[socket.request.session.classId].steps[index].lesson)
                        classInformation.classrooms[socket.request.session.classId].lesson = lesson
                        database.run('INSERT INTO lessons(class, content, date) VALUES(?, ?, ?)',
                            [classInformation.classrooms[socket.request.session.classId].className, JSON.stringify(classInformation.classrooms[socket.request.session.classId].lesson), classInformation.classrooms[socket.request.session.classId].lesson.date], (err) => {
                                if (err) logger.log('error', err.stack)
                            }
                        )
                        classInformation.classrooms[socket.request.session.classId].poll.textRes = false
                        classInformation.classrooms[socket.request.session.classId].poll.prompt = classInformation.classrooms[socket.request.session.classId].steps[index].prompt
                    } else if (classInformation.classrooms[socket.request.session.classId].steps[index].type == 'quiz') {
                        // Check this later, there's already a quiz if statement
                        questions = classInformation.classrooms[socket.request.session.classId].steps[index].questions
                        
                        const quiz = new Quiz(questions.length, 100)
                        quiz.questions = questions
                        classInformation.classrooms[socket.request.session.classId].quiz = quiz
                    } else if (classInformation.classrooms[socket.request.session.classId].steps[index].type == 'lesson') {
                        // Check this later, there's already a lesson if statement
                        
                        const lesson = new Lesson(classInformation.classrooms[socket.request.session.classId].steps[index].date, classInformation.classrooms[socket.request.session.classId].steps[index].lesson)
                        classInformation.classrooms[socket.request.session.classId].lesson = lesson
                        database.run('INSERT INTO lessons(class, content, date) VALUES(?, ?, ?)',
                            [classInformation.classrooms[socket.request.session.classId].className, JSON.stringify(classInformation.classrooms[socket.request.session.classId].lesson), classInformation.classrooms[socket.request.session.classId].lesson.date], (err) => {
                                if (err) logger.log('error', err.stack)
                            }
                        )
                    }

                    socketUpdates.pollUpdate()
                    socketUpdates.modeUpdate()
                    socketUpdates.quizUpdate()
                    socketUpdates.lessonUpdate()
                } else {
                    classInformation.classrooms[socket.request.session.classId].currentStep = 0
                }

                socketUpdates.classPermissionUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}