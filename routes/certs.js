const fs = require('fs');
const { logger } = require("../modules/logger");
const { logNumbers } = require("../modules/config");

module.exports = {
    run(app) {
        try {
            app.get('/certs', (req, res) => {
                res.render('pages/message', {
                    title: 'Certs',
                    message: fs.readFileSync('publicKey.pem', 'utf8'),
                    excluded: true
                })
            });
        } catch (err) {
            logger.log('error', err.stack);
            res.render('pages/message', {
                message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                title: 'Error'
            })
        }
    }
}