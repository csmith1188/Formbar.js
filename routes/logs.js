const { isLoggedIn, permCheck } = require("../modules/authentication");
const { logger } = require("../modules/logger");
const fs = require('fs');
const {logNumbers} = require("../modules/config");

module.exports = {
    run(app) {
        // Handle displaying all logs to the manager
        app.get('/logs', isLoggedIn, permCheck, (req, res) => {
            try {
                logger.log('info', `[get /logs] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

                const logs = fs.readdirSync('./logs').filter((fileName) => fileName.endsWith('.log'));
                res.render('pages/logs', { logs });
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                })
            }
        });

        // Handle displaying a specific log to the manager
        app.get('/logs/:log', isLoggedIn, permCheck, (req, res) => {
            try {
                logger.log('info', `[get /logs/:log] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

                const log = req.params.log;
                console.log('log');
                if (!fs.existsSync(`./logs/${log}`)) {
                    res.render('pages/message', {
                        message: `Error: Log file ${log} not found.`,
                        title: 'Error'
                    })
                }

                const content = fs.readFileSync(`./logs/${log}`, 'utf8');
                res.render('pages/log', { log, content });
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