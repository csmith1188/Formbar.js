const { logger } = require('../../modules/logger');
const { logNumbers } = require('../../modules/config');
const { database } = require('../../modules/database');

module.exports = {
    run(app) {
        app.post('/api/transfer', async (req, res) => {
            try {
                if (!req.body.consent) {
                    req.session.data = req.body;
                    res.redirect('/consent');
                    return;
                };
                // If the data is invalid, render an error message
                if (!req.session.data || !req.session.data.app || !req.session.data.digipogs || !req.session.data.reason || req.session.data.redirectURL) {
                    res.render('pages/message', {
                        message: 'Invalid data.',
                        title: 'Error'
                    });
                    return;
                };
                const data = req.session.data;
                data.sender = req.session.userId;
                data.reciever = await new Promise ((resolve, reject) => {
                    database.get('SELECT owner FROM apps WHERE id = ?', [data.app], (err, row) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(row.id);
                        };
                    });
                });
                if (data.digipogs < 1) {
                    res.render('pages/message', {
                        message: 'Invalid amount of digipogs.',
                        title: 'Error'
                    });
                    return;
                };
                // Get the full flag from the database
                data.full = await new Promise ((resolve, reject) => {
                    database.get('SELECT full FROM apps WHERE id = ?', [data.app], (err, row) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(row.full? true : false);
                        };
                    });
                });
                req.session.data = undefined;
                // If the user accepts the transfer, emit the transferDigipogs event, otherwise emit the transferDenied event
                if (req.body.consent === 'accept') {
                    // If the full flag is not set, halve the digipogs
                    if (!data.full) data.digipogs = Math.ceil(data.digipogs / 2); 
                    // Add half the digipogs to the reciever and remove the digipogs from the sender
                    database.run('UPDATE users SET digipogs = digipogs + ? WHERE id = ?', [data.digipogs, data.reciever], (err) => {
                        if (err) {
                            logger.log('error', err.stack);
                        };
                    });
                    database.run('UPDATE users SET digipogs = digipogs - ? WHERE id = ?', [data.digipogs, data.sender], (err) => {
                        if (err) {
                            logger.log('error', err.stack);
                        };
                    });
                    // Insert the transaction into the database
                    database.run('INSERT INTO transactions (sender, reciever, digipogs, app, reason, date) VALUES (?, ?, ?, ?, ?, ?)', 
                        [
                            data.sender, 
                            data.reciever, 
                            data.digipogs, 
                            data.app,
                            data.reason,
                            // Outputs the date in the format: DD/MM/YYYY, HH:MM:SS AM/PM. EST Time
                            new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
                        ], 
                        (err) => {
                        if (err) {
                            logger.log('error', err.stack);
                        };
                    });
                    res.redirect(data.redirectURL, { consent: 'accepted' });
                } else {
                    // Insert the transaction into the database
                    database.run('INSERT INTO transactions (sender, reciever, digipogs, app, reason, date) VALUES (?, ?, ?, ?, ?, ?)', 
                        [
                            data.sender, 
                            data.reciever, 
                            0, 
                            data.app,
                            `[Denied] ${data.reason}`,
                            // Outputs the date in the format: DD/MM/YYYY, HH:MM:SS AM/PM. EST Time
                            new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
                        ], 
                        (err) => {
                        if (err) {
                            logger.log('error', err.stack);
                        };
                    });
                    res.redirect(data.redirectURL, { consent: 'denied' });
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