const { transferDigipogs } = require('../modules/digipogs');
const { database } = require('../modules/database');
const jwt = require('jsonwebtoken');

module.exports = {
    run(app) {
        app.get('/transfer', async (req, res) => {
            const API = await new Promise((resolve, reject) => {
                database.get('SELECT API FROM users WHERE id = ?', [req.query.to], (err, row) => {
                    if (err) {
                        reject(err);
                    }
                    resolve(row.API);
                });
            });
            let data;
            try {
                data = jwt.verify(req.query.data, API);
            } catch {
                return res.status(400).send('Invalid data');
            };
            const { amount, reason, app } = data;
            let receiverText;
            app === 'None' ? receiverText = `User ${req.query.to}` : receiverText = `App ${app}`;
            if (!req.session.userId) {
                req.session.redirect = req.originalUrl;
                res.render('pages/login', { 
                    title: 'Login', 
                    route: 'transfer',
                    redirectURL: req.originalUrl 
                });
            } else if (!req.query.consent) {
                res.render('pages/consent', { 
                    title: 'Consent', 
                    data: req.query.data,
                    to: req.query.to,
                    redirect: req.query.redirect,
                    receiverText: receiverText,
                    reason: reason,
                    amount: amount 
                });
            } else if (req.query.consent === 'true') {
                transferDigipogs(req.session.userId, req.query.to, amount, app, reason).then(result => {
                    // If the transfer was successful, redirect back with consent true
                    if (result) res.redirect(`${req.query.redirect}?consent=${jwt.sign({ consent: true }, API)}`)
                    else res.redirect(`${req.query.redirect}?consent=${jwt.sign({ consent: false }, API)}`);
                });
            } else {
                database.run('INSERT INTO transactions ("from", "to", digipogs, app, reason, date) VALUES (?, ?, ?, ?, ?, ?)', [
                    req.session.userId,
                    req.query.to,
                    0,
                    app,
                    `Declined: ${reason} [Amount of: ${amount}]`,
                    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
                ], (err) => {
                    if (err) {
                        console.error(err);
                    };
                    res.redirect(`${req.query.redirect}?consent=${jwt.sign({ consent: false }, API)}`);
                });
            };
        });
    }
};