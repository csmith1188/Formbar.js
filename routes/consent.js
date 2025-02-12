const { logger } = require('../modules/logger');
const { logNumbers } = require('../modules/config');
const { database } = require('../modules/database');
const crypto = require('crypto');

module.exports = {
    run(app) {
        app.get('/consent', async (req, res) => {
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
                logger.log('info', `[get /consent] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                // If the key or data is not provided, redirect to the home page
                if (!req.query.key || req.query.data) res.redirect('/');
                // Get the key from the database
                const key = await new Promise((resolve, reject) => {
                    database.get('SELECT key FROM apps WHERE key = ?', [req.query.key], (err, row) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(row.key);
                        }
                    });
                });
                // Function to decrypt the given data
                function decrypt(data, key) {
                    const algorithm = 'aes-256-cbc';
                    const iv = Buffer.from(key.slice(0, 32), 'hex'); // Use the first 32 characters of the key as the IV
                    const encryptedText = Buffer.from(data, 'hex');
                    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'hex'), iv);
                    let decrypted = decipher.update(encryptedText);
                    decrypted = Buffer.concat([decrypted, decipher.final()]);
                    return decrypted.toString();
                };
                // Set the data object to the decrypted data
                const data = JSON.parse(decrypt(req.query.data, key)); // Assuming req.query.data contains iv and encryptedData
                // Set the redirectURL, sender, and reciever in the session
                req.session.data = data;
                // If the digipogs are less than 1, return
                if (data.digipogs < 1) {
                    res.render('pages/message', {
                        message: 'You cannot transfer less than 1 digipog.',
                        title: 'Error'
                    });
                    return;
                };
                const senderBalance = await new Promise((resolve, reject) => {
                    database.get('SELECT digipogs FROM users WHERE id = ?', [req.session.userId], (err, row) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(row.digipogs);
                        };
                    });
                });
                // If the user does not have enough digipogs, return
                if (senderBalance < data.digipogs) {
                    res.render('pages/message', {
                        message: 'You do not have enough digipogs to transfer.',
                        title: 'Error'
                    });
                    return;
                };
                // Set the sender to the user's id
                req.session.data.sender = req.session.userId;
                // Set the reciever to the owner of the given app
                req.session.data.reciever = await new Promise((resolve, reject) => {
                    database.get('SELECT owner FROM apps WHERE id = ?', [data.app], (err, row) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(row.owner);
                        };
                    });
                });
                // Set the full flag in the session
                req.session.data.full = await new Promise((resolve, reject) => {
                    database.get('SELECT full FROM apps WHERE id = ?', [data.app], (err, row) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(row.full === 1 ? true : false);
                        };
                    });
                });
                const digipogs = data.digipogs;
                // Get the name of the app from the database
                const name = await new Promise((resolve, reject) => {
                    database.get('SELECT name FROM apps WHERE id = ?', [data.app], (err, row) => {
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
        app.post('/consent', (req, res) => {
            try {
                // Create the data object to be sent to the socket
                const data = {
                    reciever: req.session.data.reciever,
                    sender: req.session.data.sender,
                    digipogs: req.session.data.digipogs,
                    app: req.session.data.app,
                    reason: req.session.data.reason,
                    url: req.session.data.redirectURL,
                    response: req.body.consent === 'accept' ? true : false
                };
                // Set the redirectURL constant and wipe the rest of the information used in consent from the session
                const redirectURL = req.session.data.redirectURL;
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
                    res.redirect(redirectURL, { consent: 'accepted' });
                } else {
                    // Insert the transaction into the database
                    database.run('INSERT INTO transactions (sender, reciever, digipogs, app, reason, date) VALUES (?, ?, ?, ?, ?, ?)', 
                        [
                            data.sender, 
                            data.reciever, 
                            0, 
                            data.app,
                            'Denied',
                            // Outputs the date in the format: DD/MM/YYYY, HH:MM:SS AM/PM. EST Time
                            new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
                        ], 
                        (err) => {
                        if (err) {
                            logger.log('error', err.stack);
                        };
                    });
                    res.redirect(redirectURL, { consent: 'denied' });
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