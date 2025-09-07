const { isAuthenticated} = require('./middleware/authentication');
const { classInformation } = require('../modules/class/classroom');
const { logNumbers } = require('../modules/config');
const { logger } = require('../modules/logger');

module.exports = {
    run(app) {
        // The page displaying the API key used when handling oauth2 requests from outside programs such as formPix
        app.get('/apikey', isAuthenticated, (req, res) => {
            try {
                logger.log('info', `[get /apikey] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

                res.render('pages/apiKey', {
                    title: 'API Key',
                    API: classInformation.users[req.session.email].API
                });
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                });
            };
        });
    }
};