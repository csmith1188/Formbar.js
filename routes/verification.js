const { database } = require('../modules/database')
const { logNumbers } = require('../modules/config')
const { logger } = require('../modules/logger')
const sendMail = require('../modules/mail.js').sendMail;
const crypto = require('crypto');

module.exports = {
    run(app) {
        const location = process.env.LOCATION;
        // Make a post request to send the verification email
        app.post('/verification', (req, res) => {
            // If there is no session token, return
            if (!req.session.token) return;
            // Set the token to the session token
            const token = req.session.token;
            // Create the HTML content for the email
            const html = `
            <h1>Verify your email</h1>
            <p>Click the link below to verify your email address with Formbar</p>
                <a href='${location}/verification?code=${token}'>Verify Email</a>
            `;
            // Send the email
            sendMail(req.session.email, 'Formbar Verification', html);
        });
        // Make a get request for the verification route
        app.get('/verification', (req, res) => {
            // If there is no session token, create one
            if (!req.session.token) req.session.token = crypto.randomBytes(64).toString('hex');
            // Get the email from the session
            const email = req.session.email;
            // If there is no email in the session... 
            if (!email) {
                // Render the message page with the following message
                res.render('pages/message', {
                    message: `There is no email in this session.`,
                    title: 'Verification'
                })
                // Return to prevent further execution
                return;
            };
            // Get the verification code from the query string
            const token = req.query.code;
            // If there is no token...
            if (!token) {
                // Render the verification page with the email
                res.render('pages/verification', { email: email });
                // Return to prevent further execution
                return;
            };
            // If the tokens match...
            if (req.session.token === token) {
                // Update the user's verified status in the database
                database.get(`UPDATE users SET verified = 1 WHERE email = '${email}'`, (errpr) => {
                    // If there is an error...
                    if (error) {
                        // Log the error with the logger
                        logger.log('error', err.stack);
                        // Render the message page with the error message
                        res.render('pages/message', {
                            message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                            title: 'Error'
                        })
                        // Return to prevent further execution
                        return;
                    };
                    // Log the verification
                    console.log(`[${email}]: Verified`);
                    // Set the session verified status to true
                    req.session.verified = 1;
                    // Render the verification page with the email and verified status equal to 1
                    res.redirect('/');
                });
            } else {
                // Render the message page with the following message
                res.render('pages/message', {
                    message: `Provided token does not match the session token.`,
                    title: 'Verification'
                });
            };
        });
    }
};