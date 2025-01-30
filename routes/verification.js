const { database } = require('../modules/database')
const { logNumbers } = require('../modules/config')
const { logger } = require('../modules/logger')
const { sendMail, limitStore, RATE_LIMIT } = require('../modules/mail.js');

module.exports = {
    run(app) {
        const location = process.env.LOCATION;
        // Make a post request to send the verification email
        app.post('/verification', async (req, res) => {
            try {
                // Create a promise for the user's email
                const email = req.session.email || req.query.email;
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

        // Make a get request for the verification route
        app.get('/verification', async (req, res) => {
            // Create a promise for the user's email
            const email = req.session.email;
            // Create a promise for the user's secret
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
                        res.redirect('/');
                    };
                });
            });
            // If there is no email for the user... 
            if (!email) {
                // Render the message page with the following message
                res.render('pages/message', {
                    message: `No email associated with user.`,
                    title: 'Verification'
                })
                // Return to prevent further execution
                return;
            };
            // Get the verification code from the query string
            const code = req.query.code;
            // If there is no token...
            if (!code) {
                // Render the verification page with the email
                res.render('pages/verification', { 
                    title: 'Verification',
                    email: email 
                });
                // Return to prevent further execution
                return;
            };
            // If the tokens match...
            if (token === code) {
                // Update the user's verified status in the database
                database.get(`UPDATE users SET verified = 1 WHERE email = '${email}'`, (error) => {
                    // If there is an error...
                    if (error) {
                        // Log the error with the logger
                        logger.log('error', error.stack);
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
                    res.redirect('/')
                });
            } else {
                // Render the message page with the following message
                res.render('pages/message', {
                    message: `Provided token does not match the user token.`,
                    title: 'Verification'
                });
            };
        });
    }
};