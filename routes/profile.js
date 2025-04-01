const { isVerified } = require('../modules/authentication');
const { database } = require('../modules/database');
const { logger } = require('../modules/logger')

module.exports = {
    run(app) {
        app.get('/profile', isVerified, async (req, res) => {
            try {
                // Log the request information
                logger.log('info', `[get /profile] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                console.log(req.session.userId)
                const API = await new Promise((resolve, reject) => {
                    database.get('SELECT API FROM users WHERE id = ?', [req.session.userId], (err, row) => {
                        if (err) {
                            reject(err);
                        }
                        console.log(row)
                        resolve(row);
                    });
                });
                res.render('pages/profile', {
                    title: 'Profile',
                    user: req.session.username,
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