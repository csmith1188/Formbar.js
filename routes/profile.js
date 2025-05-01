const { isVerified } = require('../modules/authentication');
const { dbGet } = require('../modules/database');
const { logger } = require('../modules/logger')
const { logNumbers } = require('../modules/config');

module.exports = {
    run(app) {
        app.get('/profile/:userId?', isVerified, async (req, res) => {
            try {
                // Log the request information
                logger.log('info', `[get /profile] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                const userId = req.params.userId || req.session.userId;
                const userData = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
                // Check if userData is null or undefined
                if (!userData) {
                    logger.log('error', 'User data not found in database');
                    return res.render('pages/message', {
                        message: 'Please enter a valid user ID.',
                        title: 'Error'
                    });
                }
                const { displayName, email, digipogs, API } = userData;
                res.render('pages/profile', {
                    title: 'Profile',
                    displayName: displayName,
                    email: email,
                    digipogs: digipogs,
                    id: userId,
                    API: req.session.userId == req.params.userId || req.params.userId == undefined ? API : null,
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