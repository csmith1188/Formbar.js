const { isAuthenticated, permCheck } = require("../modules/authentication")
const { classInformation } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { logger } = require("../modules/logger")

module.exports = {
    run(app) {
        /* 
        Student page, the layout is controlled by different "modes" to display different information.
        There is currently 1 working mode:
            Poll: For displaying a multiple choice or essay question
        */
        app.get('/student', isAuthenticated, permCheck, (req, res) => {
            try {
                // Poll Setup
                let user = {
                    name: req.session.username,
                    class: req.session.classId,
                    tags: req.session.tags
                }
                let answer = req.query.letter

                logger.log('info', `[get /student] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                logger.log('verbose', `[get /student] question=(${JSON.stringify(req.query.question)}) answer=(${req.query.letter})`)

                if (answer) {
                    classInformation.classrooms[req.session.classId].students[req.session.username].pollRes.buttonRes = answer
                }

                // Render the student page with the user's information
                logger.log('verbose', `[get /student] user=(${JSON.stringify(user)}) myRes = (classInformation.classrooms[req.session.classId].students[req.session.username].pollRes.buttonRes) myTextRes = (classInformation.classrooms[req.session.classId].students[req.session.username].pollRes.textRes) lesson = (classInformation.classrooms[req.session.classId].lesson)`)
                res.render('pages/student', {
                    title: 'Student',
                    user: JSON.stringify(user),
                    myRes: classInformation.classrooms[req.session.classId].students[req.session.username].pollRes.buttonRes,
                    myTextRes: classInformation.classrooms[req.session.classId].students[req.session.username].pollRes.textRes
                })
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                })
            }
        })

        /* 
        This is for when you send poll data via a post command
        It'll save your response to the student object and the database.
        */
        app.post('/student', isAuthenticated, permCheck, (req, res) => {
            try {
                logger.log('info', `[post /student] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                logger.log('verbose', `[post /student] poll=(${JSON.stringify(req.query.poll)}) question=(${JSON.stringify(req.body.question)})`)

                if (req.query.poll) {
                    const answer = req.body.poll
                    if (answer) {
                        classInformation.classrooms[req.session.classId].students[req.session.username].pollRes.buttonRes = answer
                    }
                    res.redirect('/poll')
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