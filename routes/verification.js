const crypto = require('crypto');
const sendMail = require('../modules/mail.js').sendMail;
const database = require('../modules/database.js');
const { run } = require('./404');

module.exports = {
    run(app) {
        app.post('/verification', (req, res) => {
            // Create a token for verifying the email
            const token = crypto.randomBytes(64).toString('hex');
            // Create the HTML content for the email
            const html = `
                <h1>Verify your email</h1>
                <p>Click the link below to verify your email address</p>
                <a href="http://localhost:3000/verification?code=${token}">Verify Email</a>
            `;
            // Send the email
            sendMail(req.session.email, 'Verify your email with Formbar', html);
        });

        // Make a post request to update the verified status of the user
        app.get('/verification', (req, res) => {
            // Get the verification code from the query string
            const token = req.query.code;
            // Get the email from the session
            const email = req.session.email;
            if (!email) {
                res.status(400).send('Email not found in session');
                return;
            }
            res.render('pages/verification', { email: email });
            if (!token) return;
            // Check if the verification code is correct
            database.get('SELECT * FROM users WHERE email = ? AND verification_code = ?', [email, token], (err, user) => {
                if (err) {
                    res.status(500).send('Internal Server Error');
                } else if (!user) {
                    res.status(400).send('Invalid verification code');
                } else {
                    // Update the user's verified status
                    database.run('UPDATE users SET verified = 1 WHERE email = ?', [email], (err) => {
                        if (err) {
                            res.status(500).send('Internal Server Error');
                        } else {
                            res.send('Email verified successfully');
                        }
                    });
                };
            });
        });
    }
};