const { isAuthenticated, permCheck, isVerified } = require("./middleware/authentication");
const { logNumbers } = require("../modules/config")
const { logger } = require("../modules/logger")

module.exports = {
    run(app) {
        app.get('/links', isAuthenticated, permCheck, isVerified, (req, res) => {
            try {
                logger.log('info', `[get /links] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

                res.render('pages/links.ejs', {
                    title: 'Links'
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