const { isAuthenticated, permCheck, isVerified } = require("../modules/authentication")
const { classInformation } = require("../modules/class/classroom")
const { logNumbers } = require("../modules/config")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")

module.exports = {
    run(app) {
        /* Allows the user to view previous lessons created, they are stored in the database- Riley R., May 22, 2023 */
        app.get('/previousLessons', isAuthenticated, permCheck, isVerified, (req, res) => {
            try {
                logger.log('info', `[get /previousLessons] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

                database.all('SELECT * FROM lessons WHERE class=?', classInformation.classrooms[req.session.classId].className, async (err, lessons) => {
                    try {
                        if (err) throw err

                        logger.log('verbose', `[get /previousLessons] rows=(${JSON.stringify(lessons)})`)

                        res.render('pages/previousLesson', {
                            rows: lessons,
                            title: 'Previous Lesson'
                        })
                    } catch (err) {
                        logger.log('error', err.stack);
                        res.render('pages/message', {
                            message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                            title: 'Error'
                        })
                    }
                })
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                })
            }
        })

        app.post('/previousLessons', isAuthenticated, permCheck, (req, res) => {
            try {
                let lesson = JSON.parse(req.body.data)

                logger.log('info', `[post /previousLessons] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

                res.render('pages/lesson', {
                    lesson: lesson,
                    title: "Today's Lesson"
                })
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