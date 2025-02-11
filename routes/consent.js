const { logger } = require('../modules/logger');
const { logNumbers } = require('../modules/config');
const { io } = require('../modules/webServer');
const { database } = require('../modules/database');

module.exports = {
    run(app) {
        app.get('/consent', async (req, res) => {
            try {
                // if (!req.query.app || !req.query.digipogs || !req.query.reciever || !req.query.user || !req.query.redirectURL) {
                //     res.redirect('/');
                //     return;
                // }
                // Set up the variables needed for the consent screen
                req.session.redirect = req.query.redirectURL;
                req.session.tempUser = req.query.user;
                req.session.reciever = req.query.reciever;
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
                // Render the consent screen with the app name and the amount of digipogs being transferred
                res.render('pages/consent', {
                    title: 'Consent',
                    name: appName, // The app requesting the transfer
                    digipogs: digipogs, // The amount of digipogs being transferred
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
                // Create the data object to be sent to the socket
                const data = {
                    digipogs: req.body.digipogs,
                    reciever: req.session.reciever,
                    user: req.session.tempUser
                };
                // Set the redirectURL constant and wipe the rest of the information used in consent from the session
                const redirectURL = req.session.redirectURL;
                req.session.redirectURL = undefined;
                req.sesison.tempUser = undefined;
                req.session.reciever = undefined;
                // If the user accepts the transfer, emit the transferDigipogs event, otherwise emit the transferDenied event
                if (req.body.consent === 'accept') {
                    io.emit('transferDigipogs', data);
                    res.redirect(redirectURL);
                } else {
                    io.emit('transferDenied', data);
                    res.redirect(redirectURL);
                };
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