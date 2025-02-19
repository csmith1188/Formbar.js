const { transferDigipogs } = require('../modules/digipogs');
const { database } = require('../modules/database');
const jwt = require('jsonwebtoken');

module.exports = {
    run(app) {
        app.get('/transfer', async (req, res) => {
            console.log(req.query);
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
            if (app === 'None') {
                receiverText = `User ${req.query.to}`
            } else {
                receiverText = `App (${app})`
            };
            if (!req.session.userId) {
                res.render('pages/login', { 
                    title: 'Login', 
                    route: 'transfer',
                    redirectURL: req.originalUrl 
                });
            } else if (!req.body.consent) {
                res.render('pages/consent', { 
                    title: 'Consent', 
                    redirect: req.originalUrl,
                    receiverText: receiverText,
                    reason: reason,
                    amount: amount 
                });
            } else if (req.body.consent === 'true') {
                transferDigipogs(req.session.userId, to, amount, app, reason).then(result => {
                    if (result) {
                        fetch(req.query.redirect, {
                            method: 'POST',
                            body: jwt.sign({ consent: true }, API)
                        });
                    } else {
                        fetch(req.query.redirect, {
                            method: 'POST',
                            body: jwt.sign({ consent: false }, API)
                        });
                    };
                });
            } else {
                database.run('INSERT INTO transactions ("from", "to", digipogs, app, reason, date) VALUES (?, ?, ?, ?, ?, ?)', [
                    req.session.userId,
                    to,
                    0,
                    app,
                    `Declined: ${reason} [Amount of: ${amount}]`,
                    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
                ], (err) => {
                    if (err) {
                        console.error(err);
                    };
                });
                fetch(req.query.redirect, {
                    method: 'POST',
                    body: jwt.sign({ consent: false }, API)
                });
            };
        });
    }
};