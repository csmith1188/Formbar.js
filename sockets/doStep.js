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
                
                const classId = socket.request.session.classId;
                const classroom = classInformation.classrooms[classId];

                // Send a reload event to everyone in the class
                socket.broadcast.to(classId).emit('reload')
                classInformation.classrooms[classId].currentStep++

                if (classroom.steps[index] !== undefined) {
                    // Creates a poll based on the step data
                    if (classroom.steps[index].type == 'poll') {
                        classroom.mode = 'poll'
                        if (classroom.poll.status == true) {
                            classroom.poll.responses = {}
                            classroom.poll.prompt = ''
                            classroom.poll.status = false
                        };

                        classroom.poll.status = true
                        
                        // Creates an object for every answer possible the teacher is allowing
                        for (let i = 0; i < classroom.steps[index].responses; i++) {
                            if (classroom.steps[index].labels[i] == '' || classroom.steps[index].labels[i] == null) {
                                let letterString = 'abcdefghijklmnopqrstuvwxyz'
                                classroom.poll.responses[letterString[i]] = { answer: 'Answer ' + letterString[i], weight: 1 }
                            } else {
                                classroom.poll.responses[classroom.steps[index].labels[i]] = { answer: classroom.steps[index].labels[i], weight: classroom.steps[index].weights[i] }
                            }
                        }
                        classroom.poll.textRes = false
                        classroom.poll.prompt = classroom.steps[index].prompt
                    } else if (classroom.steps[index].type == 'quiz') {
                        // Creates a new quiz based on step data
                        classroom.mode = 'quiz'
                        questions = classroom.steps[index].questions
                        
                        const quiz = new Quiz(questions.length, 100)
                        quiz.questions = questions
                        classroom.quiz = quiz
                    } else if (classroom.steps[index].type == 'lesson') {
                        // Creates lesson based on step data
                        classroom.mode = 'lesson'
                        
                        const lesson = new Lesson(classroom.steps[index].date, classroom.steps[index].lesson)
                        classroom.lesson = lesson
                        database.run('INSERT INTO lessons(class, content, date) VALUES(?, ?, ?)',
                            [classroom.className, JSON.stringify(classroom.lesson), classroom.lesson.date], (err) => {
                                if (err) logger.log('error', err.stack)
                            }
                        )
                        classroom.poll.textRes = false
                        classroom.poll.prompt = classroom.steps[index].prompt
                    } else if (classroom.steps[index].type == 'quiz') {
                        // Check this later, there's already a quiz if statement
                        questions = classroom.steps[index].questions
                        
                        const quiz = new Quiz(questions.length, 100)
                        quiz.questions = questions
                        classroom.quiz = quiz
                    } else if (classroom.steps[index].type == 'lesson') {
                        // Check this later, there's already a lesson if statement
                        
                        const lesson = new Lesson(classroom.steps[index].date, classroom.steps[index].lesson)
                        classroom.lesson = lesson
                        database.run('INSERT INTO lessons(class, content, date) VALUES(?, ?, ?)',
                            [classroom.className, JSON.stringify(classroom.lesson), classroom.lesson.date], (err) => {
                                if (err) logger.log('error', err.stack)
                            }
                        )
                    }

                    socketUpdates.pollUpdate()
                    socketUpdates.modeUpdate()
                    socketUpdates.quizUpdate()
                    socketUpdates.lessonUpdate()
                } else {
                    classroom.currentStep = 0
                }

                socketUpdates.classPermissionUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}