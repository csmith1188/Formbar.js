const { logger } = require('../modules/logger');
const { sendMail } = require('../modules/mail.js');
const { database } = require('../modules/database.js');
const { hash } = require('../modules/crypto.js');
const crypto = require('crypto');
const { logNumbers } = require('../modules/config.js');

module.exports = {
    run(app) {
        const location = process.env.LOCATION;
        app.get('/changepassword', (req, res) => {
            try {
                // If there is no session token, create one
                if (!req.session.token) req.session.token = crypto.randomBytes(64).toString('hex');
                
                // If there is no token, render the normal change password page
                const token = req.query.code;
                if (token === undefined || token === null) { 
                    res.render('pages/changepassword', { 
                        sent: false,
                        title: 'Change Password'
                    });
                    return;
                }

                // If the token is valid, render the page to let the user reset their password
                // If not, render an error message
                if (token === req.session.token) {
                    // Set session email so that it can be used when changing the password
                    req.session.email = req.query.email;

                    res.render('pages/changepassword', {
                        sent: true,
                        title: 'Change Password'
                    });
                } else {
                    res.render('pages/message', {
                        message: 'Invalid token',
                        title: 'Error'
                    });
                };
            } catch (err) {
                logger.log('error', err.stack);
            };
        });

        app.post('/changepassword', async (req, res) => {
            try {
                if (req.body.email) {
                    // Send an email to the user with the password change link
                    sendMail(req.body.email, 'Formbar Password Change', `
                        <h1>Change your password</h1>
                        <p>Click the link below to change your password</p>
                        <a href='${location}/changepassword?code=${req.session.token}&email=${req.body.email}'>Change Password</a>
                    `);
                    res.redirect('/');
                } else if (req.body.newPassword !== req.body.confirmPassword) {
                    // If the passwords do not match, tell the user
                    res.render('pages/message', {
                        message: 'Passwords do not match',
                        title: 'Error'
                    });
                } else if (req.session.email) {
                    // If the email is in the session, change the password
                    const hashedPassword = await hash(req.body.newPassword);
                    database.run('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, req.session.email], (err) => {
                        if (err) {
                            logger.log('error', err.stack);
                            res.render('pages/message', {
                                message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                title: 'Error'
                            });
                        }

                        res.redirect("/login");
                    });
                }
            } catch (err) {
                logger.log('error', err.stack);
            };
        });
    }
};