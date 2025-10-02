const { logger } = require("../modules/logger");
const { logNumbers } = require("../modules/config");
const fs = require('fs');

module.exports = {
    run(app) {
        try {
            app.get('/certs', (req, res) => {
                try {
                    const pem = fs.readFileSync('publicKey.pem', 'utf8');
                    res.json({ publicKey: pem });
                } catch (err) {
                    logger.log('error', err.stack);
                    res.render('pages/message', {
                        message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                        title: 'Error'
                    });
                }
            });
        } catch (err) {
            logger.log('error', err.stack);
        }
    }
}