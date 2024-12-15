const { isAuthenticated } = require("../modules/authentication")
const { classInformation } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { logger } = require("../modules/logger")
const { TEACHER_PERMISSIONS } = require("../modules/permissions")

module.exports = {
    run(app) {
        // This is the root page, it is where the users first get checked by the home page
        // It is used to redirect to the home page
        // This allows it to check if the user is logged in along with the home page
        // It also allows for redirection to any other page if needed
        app.get('/', isAuthenticated, (req, res) => {
            try {
                logger.log('info', `[get /] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                if (classInformation.users[req.session.username].permissions >= TEACHER_PERMISSIONS) {
                    res.redirect('/controlPanel')
                } else {
                    res.redirect('/student')
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