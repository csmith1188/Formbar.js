const { isLoggedIn, permCheck } = require("../modules/authentication")
const { classInformation } = require("../modules/class/classroom")
const { logNumbers } = require("../modules/config")
const { logger } = require("../modules/logger")

module.exports = {
    run(app) {
        // Loads which classes the teacher is an owner of
        // This allows the teacher to be in charge of all classes
        // The teacher can give any perms to anyone they desire, which is useful at times
        // This also allows the teacher to kick or ban if needed
        app.get('/manageClass', isLoggedIn, permCheck, (req, res) => {
            try {
                logger.log('info', `[get /manageClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                logger.log('verbose', `[get /manageClass] currentUser=(${JSON.stringify(classInformation.users[req.session.email])})`)

                // Finds all classes the teacher is the owner of
                res.render('pages/manageClass', {
                    title: 'Create Class',
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