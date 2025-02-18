const jwt = require('jsonwebtoken');
const secretKey = 'your-secret-key'; // Replace with a strong secret key

module.exports = {
    run(app) {
        app.get('/consent', (req, res) => {
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
        });
    }
}