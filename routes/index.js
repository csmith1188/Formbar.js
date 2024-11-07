// This is the root page, it is where the users first get checked by the home page
// It is used to redirect to the home page
// This allows it to check if the user is logged in along with the home page
// It also allows for redirection to any other page if needed

const { isAuthenticated } = require("../modules/authentication")
const { classInformation } = require("../modules/class")
const logger = require("../modules/logger")

module.exports = {
    run(app) {
        app.get('/', isAuthenticated, (req, res) => {
            try {
                logger.log('info', `[get /] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                if (classInformation[req.session.class].students[req.session.username].classPermissions >= TEACHER_PERMISSIONS) {
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