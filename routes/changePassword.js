const { logger } = require('../modules/logger');
const { sendMail } = require('../modules/mail.js');
const { database } = require('../modules/database.js');
const { hash } = require('../modules/crypto.js');
const { logNumbers } = require('../modules/config.js');

module.exports = {
    run(app) {
        app.get('/changepassword', async (req, res) => {
            try {
                // If there is no token, render the normal change password page
                const code = req.query.code;
                if (code === undefined || code === null) { 
                    res.render('pages/changepassword', { 
                        sent: false,
                        title: 'Change Password'
                    });
                    return;
                }

                // Set session email so that it can be used when changing the password
                req.session.email = req.query.email;

                // Create a promise for the user's secret
                const token = await new Promise((resolve, reject) => {
                    database.get(`SELECT secret FROM users WHERE email = '${req.session.email}'`, (error, row) => {
                        if (error) {
                            logger.log('error', error.stack);
                            // Render the message page with the error message
                            res.render('pages/message', {
                                message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                title: 'Error'
                            });
                            reject(error);
                        } else {
                            resolve(row.secret);
                        }
                    });
                });
                // If the token is valid, render the page to let the user reset their password
                // If not, render an error message
                if (code === token) {
                    res.render('pages/changepassword', {
                        sent: true,
                        title: 'Change Password'
                    });
                } else {
                    res.render('pages/message', {
                        message: 'Invalid code',
                        title: 'Error'
                    });
                };
            } catch (err) {
                logger.log('error', err.stack);
            };
        });

        app.post('/changepassword', async (req, res) => {
            try {
                const token = await new Promise((resolve, reject) => {
                    database.get(`SELECT secret FROM users WHERE email = '${req.session.email || req.body.email}'`, (error, row) => {
                        if (error) {
                            logger.log('error', error.stack);
                            // Render the message page with the error message
                            res.render('pages/message', {
                                message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                title: 'Error'
                            });
                            reject(error);
                        } else {
                            resolve(row.secret);
                        }
                    });
                });
                if (req.body.email) {
                    // Send an email to the user with the password change link
                    const location = `${req.protocol}://${req.get('host')}`;
                    sendMail(req.body.email, 'Formbar Password Change', `
                        <h1>Change your password</h1>
                        <p>Click the link below to change your password</p>
                        <a href='${location}/changepassword?code=${token}&email=${req.body.email}'>Change Password</a>
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
                        console.log(`[${req.session.email}]: Password changed`);
                        res.redirect('/');
                    });
                }
            } catch (err) {
                logger.log('error', err.stack);
            };
        });
    }
};