const fs = require('fs');
const { logger } = require("../modules/logger");
const { logNumbers } = require("../modules/config");

module.exports = {
    run(app) {
        try {
            app.get('/certs', (req, res) => {
                try {
                    const pem = fs.readFileSync('publicKey.pem', 'utf8');
                    const inline = pem.replace(/\r?\n/g, '\\n');
                    res.render('pages/message', {
                        title: 'Certs',
                        message: inline,
                        excluded: true
                    })
                } catch (err) {
                    logger.log('error', err.stack);
                    res.render('pages/message', {
                        message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                        title: 'Error'
                    })
                }
            });
        } catch (err) {
            logger.log('error', err.stack);
        }
    }
}