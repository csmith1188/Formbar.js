const { isAuthenticated, permCheck, isVerified } = require("../modules/authentication")
const { logNumbers } = require("../modules/config")
const { logger } = require("../modules/logger")

module.exports = {
    run(app) {
        app.get('/plugins', isAuthenticated, permCheck, isVerified, (req, res) => {
            try {
                logger.log('info', `[get /plugins] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
        
                res.render('pages/plugins.ejs', {
                    title: 'Plugins'
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