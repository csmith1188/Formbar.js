const { isVerified } = require('../modules/authentication');
const { dbGet } = require('../modules/database');
const { logger } = require('../modules/logger')
const { logNumbers } = require('../modules/config');

module.exports = {
    run(app) {
        app.get('/profile', isVerified, async (req, res) => {
            try {
                // Log the request information
                logger.log('info', `[get /profile] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                const userData = await dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
                // Check if userData is null or undefined
                if (!userData) {
                    logger.log('error', 'User data not found in database');
                    return res.render('pages/message', {
                        message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                        title: 'Error'
                    });
                }
                const { email, digipogs, API } = userData;
                res.render('pages/profile', {
                    title: 'Profile',
                    displayName: req.session.displayName,
                    user: req.session.username,
                    email: email,
                    digipogs: digipogs,
                    id: req.session.userId,
                    API: API
                });
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                });
            }
        });
    }
}