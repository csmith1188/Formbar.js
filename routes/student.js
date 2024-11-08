const { isAuthenticated, permCheck } = require("../modules/authentication")
const { classInformation } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { logger } = require("../modules/logger")
const { TEACHER_PERMISSIONS } = require("../modules/permissions")

module.exports = {
    run(app) {
        /* Student page, the layout is controlled by different "modes" to display different information.
        There are currently 3 working modes
        Poll: For displaying a multiple choice or essay question
        Quiz: Displaying a quiz with questions that can be answered by the student
        Lesson: used to display an agenda of sorts to the stufent, but really any important info can be put in a lesson - Riley R., May 22, 2023
        */
        app.get('/student', isAuthenticated, permCheck, (req, res) => {
            try {
                //Poll Setup
                let user = {
                    name: req.session.username,
                    class: req.session.class,
                    tags: req.session.tags
                }
                let answer = req.query.letter

                logger.log('info', `[get /student] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                logger.log('verbose', `[get /student] question=(${JSON.stringify(req.query.question)}) answer=(${req.query.letter})`)

                if (answer) {
                    classInformation[req.session.class].students[req.session.username].pollRes.buttonRes = answer
                }

                //Quiz Setup and Queries
                /* Sets up the query parameters you can enter when on the student page. These return either a question by it's index or a question by a randomly generated index.

                formbar.com/students?question=random or formbar.com/students?question=[number] are the params you can enter at the current moment.

                If you did not enter a query the page will be loaded normally. - Riley R., May 24, 2023
                */
                if (req.query.question == 'random') {
                    let random = Math.floor(Math.random() * classInformation[req.session.class].quiz.questions.length)

                    logger.log('verbose', `[get /student] quiz=(${JSON.stringify(classInformation[req.session.class].quiz.questions[random])})`)

                    res.render('pages/queryquiz', {
                        quiz: JSON.stringify(classInformation[req.session.class].quiz.questions[random]),
                        title: 'Quiz'
                    })
                    if (classInformation[req.session.class].quiz.questions[req.query.question] != undefined) {
                        logger.log('verbose', `[get /student] quiz=(${JSON.stringify(classInformation[req.session.class].quiz.questions[req.query.question])})`)

                        res.render('pages/queryquiz', {
                            quiz: JSON.stringify(classInformation[req.session.class].quiz.questions[random]),
                            title: 'Quiz'
                        })
                    }
                } else if (isNaN(req.query.question) == false) {
                    if (typeof classInformation[req.session.class].quiz.questions[req.query.question] != 'undefined') {
                        logger.log('verbose', `[get /student] quiz=(${JSON.stringify(classInformation[req.session.class].quiz.questions[req.query.question])})`)

                        res.render('pages/queryquiz', {
                            quiz: JSON.stringify(classInformation[req.session.class].quiz.questions[req.query.question]),
                            title: 'Quiz'
                        })
                    } else {
                        res.render('pages/message', {
                            message: 'Error: please enter proper data',
                            title: 'Error'
                        })
                    }
                } else if (typeof req.query.question == 'undefined') {
                    logger.log('verbose', `[get /student] user=(${JSON.stringify(user)}) myRes = (cD[req.session.class].students[req.session.username].pollRes.buttonRes) myTextRes = (cD[req.session.class].students[req.session.username].pollRes.textRes) lesson = (cD[req.session.class].lesson)`)

                    res.render('pages/student', {
                        title: 'Student',
                        user: JSON.stringify(user),
                        myRes: classInformation[req.session.class].students[req.session.username].pollRes.buttonRes,
                        myTextRes: classInformation[req.session.class].students[req.session.username].pollRes.textRes,
                        lesson: classInformation[req.session.class].lesson
                    })
                }
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                })
            }
        })

        /* This is for when you send poll data via a post command or when you submit a quiz.
        If it's a poll it'll save your response to the student object and the database.
        - Riley R., May 24, 2023
        */
        app.post('/student', isAuthenticated, permCheck, (req, res) => {
            try {
                logger.log('info', `[post /student] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                logger.log('verbose', `[post /student] poll=(${JSON.stringify(req.query.poll)}) question=(${JSON.stringify(req.body.question)})`)

                if (req.query.poll) {
                    let answer = req.body.poll
                    if (answer) {
                        classInformation[req.session.class].students[req.session.username].pollRes.buttonRes = answer
                    }
                    res.redirect('/poll')
                }
                if (req.body.question) {
                    let results = req.body.question
                    let totalScore = 0
                    for (let i = 0; i < classInformation[req.session.class].quiz.questions.length; i++) {
                        if (results[i] == classInformation[req.session.class].quiz.questions[i][1]) {
                            totalScore += classInformation[req.session.class].quiz.pointsPerQuestion
                        } else {
                            continue
                        }
                    }
                    classInformation[req.session.class].students[req.session.username].quizScore = Math.floor(totalScore) + '/' + classInformation[req.session.class].quiz.totalScore


                    let user = structuredClone(classInformation[req.session.class].students[req.session.username])
                    delete user.API
                    logger.log('verbose', `[post /student] user=(${JSON.stringify(user)}) totalScore=(${totalScore})`)

                    res.render('pages/results', {
                        totalScore: Math.floor(totalScore),
                        maxScore: classInformation[req.session.class].quiz.totalScore,
                        title: 'Results'
                    })
                }
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                })
            }
        })
    }
}