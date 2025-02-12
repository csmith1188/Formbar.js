const { logger } = require('../../modules/logger');
const { logNumbers } = require('../../modules/config');
const { database } = require('../../modules/database');

module.exports = {
    run(app) {
        app.get('/api/consent', async (req, res) => {
            try {
                // If the user is not logged in, redirect to the login page
                if (!req.session.userId) {
                    // Set the query in the session to be used after the user logs in
                    req.session.query = req.query;
                    res.render('pages/login', {
                        title: 'Login',
                        redirectURL: req.originalUrl,
                        route: 'consent'
                    });
                    return;
                };
                // If the digipogs intended to be transferred is not a number or is less than one, render an error message
                digipogs = req.query.digipogs || req.session.query.digipogs;
                if (!digipogs || digipogs < 1) {
                    res.render('pages/message', {
                        message: 'Invalid amount of digipogs.',
                        title: 'Error'
                    });
                    res.redirect(req.query.redirectURL || req.session.query.redirectURL);
                    return;
                };
                // Get the user's digipog balance
                const balance = await new Promise((resolve, reject) => {
                    database.get('SELECT digipogs FROM users WHERE id = ?', [req.session.userId], (err, row) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(row.digipogs);
                        };
                    });
                });
                // If the user does not have enough digipogs, render an error message
                if (balance < digipogs) {
                    res.render('pages/message', {
                        message: 'You do not have enough digipogs.',
                        title: 'Error'
                    });
                };
                // Get the name of the app from the database
                const name = await new Promise((resolve, reject) => {
                    database.get('SELECT name FROM apps WHERE id = ?', [req.query.app], (err, row) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(row.name);
                        };
                    });
                });
                // Render the consent screen with the app name and the amount of digipogs being transferred
                res.render('pages/consent', {
                    title: 'Consent',
                    name: name, // The app requesting the transfer
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
    }
};