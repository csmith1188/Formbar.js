const { database } = require('../modules/database')
const { logNumbers } = require('../modules/config')
const { logger } = require('../modules/logger')
const { sendMail } = require('../modules/mail')
const crypto = require('crypto');
const fs = require('fs')

module.exports = {
    run(app) {
        const location = process.env.LOCATION;

        app.get('/verification', async (req, res) => {
            // If the user is already verified or there is no .env file set up, then redirect to the home page
            if (req.session.verified || !fs.existsSync('.env')) {
                res.redirect('/');
                return;
            };

            // If there is no session token, create one
            if (!req.session.token) req.session.token = crypto.randomBytes(64).toString('hex');

            // Get the email from the session
            const email = await new Promise((resolve, reject) => {
                database.get(`SELECT email FROM users WHERE username = '${req.session.username}'`, (error, row) => {
                    if (error) {
                        // Log and render the message page with the error message
                        logger.log('error', error.stack);
                        res.render('pages/message', {
                            message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                            title: 'Error'
                        });
                        reject(error);
                    } else if (!row) {
                        res.redirect('/');
                    } else {
                        resolve(row.email);
                    }
                });
            });

            // If there is no email in the session, tell the user that there is no email associated with the user
            if (!email) {
                res.render('pages/message', {
                    message: `No email associated with user.`,
                    title: 'Verification'
                })
                return;
            };

            // Get the verification code from the query string
            const token = req.query.code;

            // If there is no token, then render the verification page with the email
            if (!token) {
                res.render('pages/verification', { 
                    title: 'Verification',
                    email: email 
                });
                return;
            };

            // If the tokens match...
            if (req.session.token === token) {
                // Update the user's verified status in the database
                database.get(`UPDATE users SET verified = 1 WHERE email = '${email}'`, (error) => {
                    // If there is an error...
                    if (error) {
                        // Log and render the message page with the error message
                        logger.log('error', error.stack);
                        res.render('pages/message', {
                            message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                            title: 'Error'
                        })
                        return;
                    };

                    // Log the verification, set the verified status to true, and redirect to the home page
                    logger.log('info', `${email} has been verified.`);
                    req.session.verified = 1;
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

        app.post('/verification', async (req, res) => {
            if (!req.session.token) return;

            // Set the token to the session token
            const token = req.session.token;
            try {
                const email = await new Promise((resolve, reject) => {
                    database.get(`SELECT email FROM users WHERE username = '${req.session.username}'`, (error, row) => {
                        if (error) {
                            // Log and render the message page with the error message
                            logger.log('error', error.stack);
                            res.render('pages/message', {
                                message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                title: 'Error'
                            });
                            reject(error);
                        } else {
                            resolve(row.email);
                        }
                    });
                });

                // Create the HTML content for the email
                const html = `
                <h1>Verify your email</h1>
                <p>Click the link below to verify your email address with Formbar</p>
                    <a href='${location}/verification?code=${token}'>Verify Email</a>
                `;

                // Send the email
                sendMail(email, 'Formbar Verification', html);
                res.render('pages/message', {
                    message: 'Verification email sent.',
                    title: 'Verification'
                });
            } catch (error) {
                logger.log('error', error.stack);
            }
        });
    }
};