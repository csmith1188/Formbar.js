const { logger } = require('../modules/logger');
const { logNumbers } = require('../modules/config');
const { io } = require('../modules/webServer');
const { database } = require('../modules/database');

module.exports = {
    run(app) {
        app.get('/consent', async (req, res) => {
            try {
                // if (!req.query.app || !req.query.digipogs || !req.query.user || !req.query.redirectURL) {
                //     res.redirect('/');
                //     return;
                // }
                req.session.redirect = req.query.redirectURL;
                req.session.tempUser = req.query.user;
                const app =  req.query.app;
                const digipogs = req.query.digipogs;
                const appName = await new Promise((resolve, reject) => {
                    database.get('SELECT app FROM apps WHERE id = ?', [app], (err, row) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(row.app);
                        };
                    });
                });

                logger.log('info', `[get /consent] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                res.render('pages/consent', {
                    title: 'Consent',
                    name: appName, // The app requesting the transfer
                    digipogs: digipogs, // The amount of digipogs being transferred
                    user: req.session.tempUser // The user requesting the transfer
                });
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                });
            };
        });
        app.post('/consent', (req, res) => {
            try {
                if (req.body.consent === 'accept') {
                    io.emit('transferDigipogs', req.body.digipogs);
                }
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                });
            };
        });
    }
};