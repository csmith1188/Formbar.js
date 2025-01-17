const { title } = require('process');
const { logger } = require('../modules/logger');
const { passwordRequest } = require('../modules/user');
const sendMail = require('../modules/mail.js').sendMail;
const crypto = require('crypto');

module.exports = {
    run(app) {
        const location = process.env.LOCATION;
        app.get('/changepassword', (req, res) => {
            try {
                // If there is no session token, create one
                if (!req.session.token) req.session.token = crypto.randomBytes(64).toString('hex');
                // Get the token from the query string
                const token = req.query.code;
                console.log(req.query.code, req.session.token);
                // If there is no token...
                if (token === undefined || token === null) { 
                    // Render the message page with the following message
                    res.render('pages/changepassword', { 
                        sent: false,
                        title: 'Change Password'
                    });
                    // Return to prevent further execution
                    return;
                };
                // If the tokens match...
                if (token === req.session.token) {
                    // Render the change password page
                    res.render('pages/changepassword', {
                        sent: true,
                        title: 'Change Password'
                    });
                // Else...
                } else {
                    console.log(token, req.session.token);
                    // Render the message page with the following message
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
                // If an email is passed...
                if (req.body.email) {
                    // Send an email to the user with the password change link
                    sendMail(req.body.email, 'Formbar Password Change', `
                        <h1>Change your password</h1>
                        <p>Click the link below to change your password</p>
                        <a href='${location}/changepassword?code=${req.session.token}&email=${req.body.email}'>Change Password</a>
                        `);
                    // Redirect to /
                    res.redirect('/');
                // If the new password does not match the confirm password...
                } else if (req.body.newPassword !== req.body.confirmPassword) {
                    // Render the message page with the following message
                    res.render('pages/message', {
                        message: 'Passwords do not match',
                        title: 'Error'
                    });
                // Else...
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