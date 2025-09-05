const jwt = require('jsonwebtoken');
const { logger } = require("../modules/logger");
const { logNumbers } = require("../modules/config");
const secretKey = 'your-secret-key'; // Replace with a strong secret key

module.exports = {
    run(app) {
        app.get('/consent', (req, res) => {
            try {
                const token = req.query.token;
                if (!token) {
                    return res.status(400).send('Token is required');
                }

                jwt.verify(token, secretKey, (err, decoded) => {
                    if (err) {
                        return res.status(401).send('Invalid token');
                    }

                    // Set session data
                    req.session.name = decoded.name;
                    req.session.digipogs = decoded.digipogs;

                    res.render('pages/consent', {
                        title: 'Consent',
                        name: req.session.name,
                        digipogs: req.session.digipogs
                    });
                });
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                })
            }
        });
    }
}