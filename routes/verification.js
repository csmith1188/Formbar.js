const { database } = require('../modules/database')
const { logNumbers } = require('../modules/config')
const { logger } = require('../modules/logger')
const { sendMail, limitStore, RATE_LIMIT } = require('../modules/mail.js')
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
            // Create a promise to retrieve the user's secret
            const token = await new Promise((resolve, reject) => {
                database.get(`SELECT secret FROM users WHERE username = '${req.session.username}'`, (error, row) => {
                    try {
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
                    } catch (error) {
                        logger.log('error', error.stack);
                    }
                });
            });
            // Get the email from the session
            const email = req.session.email || req.query.email;
            // If there is no email in the session, tell the user that there is no email associated with the user
            if (!email) {
                res.render('pages/message', {
                    message: `No email associated with user.`,
                    title: 'Verification'
                })
                return;
            };
            // Get the verification code from the query string
            // If there is no verification code, then render the verification page with the email
            const code = req.query.code;
            if (!code) {
                res.render('pages/verification', { 
                    title: 'Verification',
                    email: email 
                });
                return;
            };
            // If the tokens match...
            if (token === code) {
                // Update the user's verified status in the database
                database.get(`UPDATE users SET verified = 1 WHERE email = '${email}'`, (error) => {
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
                    message: `Provided token does not match the user token.`,
                    title: 'Verification'
                });
            };
        });
        // Make a post request to send the verification email
        app.post('/verification', async (req, res) => {
            try {
                const email = req.session.email || req.query.email;
                // Create a promise to retrieve the user's secret
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
                // Create the HTML content for the email
                const html = `
                <h1>Verify your email</h1>
                <p>Click the link below to verify your email address with Formbar</p>
                    <a href='${location}/verification?code=${token}&email=${email}'>Verify Email</a>
                `;
                // Send the email
                sendMail(email, 'Formbar Verification', html);
                // If the email has been rate limited, render the message page relaying this. Otherwise, relay that the email has been sent.
                if (limitStore.has(email) && (Date.now() - limitStore.get(email) < RATE_LIMIT)) {
                    res.render('pages/message', {
                        message: `Email has been rate limited. Please wait ${Math.ceil((limitStore.get(email) + RATE_LIMIT - Date.now())/1000)} seconds.`,
                        title: 'Verification'
                    });
                } else {
                    res.render('pages/message', {
                        message: 'Verification email sent.',
                        title: 'Verification'
                    });
                };
            } catch (error) {
                logger.log('error', error.stack);
            }
        });
    }
};