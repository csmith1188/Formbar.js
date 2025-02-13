const { transferDigipogs } = require('../modules/digipogs');
const { database } = require('../modules/database');
const { TEACHER_PERMISSIONS } = require('../modules/permissions');
const jwt = require('jsonwebtoken');

module.exports = {
    run(app) {
        app.post('/transfer', async (req, res) => {
            if ((!req.query.to || !req.query.data) && !req.session.user) {
                return res.status(400).send('To and data are required');
            };
            const name = await new Promise ((resolve, reject) => {
                database.get('SELECT name FROM apps WHERE owner = ?', [req.query.to], (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row.name);
                    };
                });
            });
            const permissions = await new Promise ((resolve, reject) => {
                database.get('SELECT permissions FROM users WHERE id = ?', [req.session.user], (err, row) => {
                    if (err) {
                        reject(err);
                    } else if (!row) {
                        resolve(0);
                    } else {
                        resolve(row.permissions);
                    };
                });
            });
            const key = await new Promise ((resolve, reject) => {
                database.get('SELECT key FROM apps WHERE owner = ?', [req.query.to], (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row.key);
                    };
                });
            });
            let data;
            try {
                data = jwt.verify(req.query.data, key);
            } catch (err) {
                console.log(err);
                return res.status(400).send('Invalid token');
            }
            if (!data.amount) {
                return res.status(400).send('Amount is required');
            };
            if (!req.session.userId) {
                const payload = {
                    data: req.query.data,
                    route: 'consent'
                };
                return res.status(401).send(JSON.stringify(payload));
            } else if (req.body.consent === 'accept') {
                if (permissions >= TEACHER_PERMISSIONS) data.reason = `Teacher: [${data.reason || 'Transfer'}]`;
                transferDigipogs(req.session.userId, req.query.to, data.amount, name, data.reason);
                res.status(200).send('Transfer successful');
            } else {
                database.run(`INSERT INTO transactions (from, to, digipogs, app, reason, date) VALUES (?, ?, ?, ?, ?, ?)`, [
                    req.session.userId,
                    req.query.to,
                    0,
                    name,
                    `Declined: [${data.reason}] Amount: [${data.amount}]`,
                    // MM/DD/YYYY HH:MM:SS AM/PM EST
                    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
                ], (err) => {
                    if (err) {
                        console.log(
                            req.session.userId,
                            +req.query.to,
                            0,
                            name,
                            `Declined: [${data.reason}] Amount: [${data.amount}]`,
                            // MM/DD/YYYY HH:MM:SS AM/PM EST
                            new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
                        )
                        console.error(err);
                    };
                });
                res.status(200).send('Transfer declined');
            };
        });
        app.get('/transfer', async (req, res) => {
            let payload
            try{
                payload = JSON.parse(req.query.data)
            } catch {
                payload = req.query
            }
            const key = await new Promise ((resolve, reject) => {
                database.get('SELECT key FROM apps WHERE owner = ?', [req.query.to], (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row.key);
                    };
                });
            });
            const data = jwt.verify(payload.data, key);
            const name = await new Promise ((resolve, reject) => {
                database.get('SELECT name FROM apps WHERE owner = ?', [payload.to], (err, row) => {
                    if (err) {
                        reject(err);
                    } else if (!row) {
                        resolve('None');
                    } else {
                        resolve(row.name);
                    };
                });
            });
            if (!req.session.userId) {
                res.render('pages/login', {
                    title: 'Login',
                    redirectURL: `/transfer?data=${payload.data}&to=${req.query.to}`,
                    route: 'transfer'
                });
                return;
            };
            res.render('pages/consent', {
                title: 'Consent',
                name: name,
                digipogs: data.amount,
                reason: data.reason,
                redirect: `/transfer?data=${payload.data}&to=${req.query.to}`
            });
        });
    }
};