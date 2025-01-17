const { logger } = require('../modules/logger');
const { passwordRequest } = require('../modules/user');
const { sendMail } = require('../modules/mail.js');
const crypto = require('crypto');

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

        app.post('/changepassword', (req, res) => {
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
                } else {
                    // Request a password change and redirect to the login page
                    passwordRequest(req.body.newPassword, req.query.email);
                    res.redirect('/login');
                };
            } catch (err) {
                logger.log('error', err.stack);
            };
        });
    }
};