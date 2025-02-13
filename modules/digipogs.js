const { database } = require('./database');
const { TEACHER_PERMISSIONS } = require('./permissions');

async function transferDigipogs(from, to, amount, app = 'None', reason = 'Transfer') {
    const permissions = await new Promise((resolve, reject) => {    
        database.get('SELECT permissions FROM users WHERE id = ?', [from], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row.permissions);
            };
        });
    });
    const full = await new Promise((resolve, reject) => {
        database.get('SELECT full FROM apps WHERE owner = ?', [to], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row.full);
            };
        });
    });
    database.run(`UPDATE users SET digipogs = digipogs - ${amount} WHERE id = '${from}'`, (err) => {
        if (err) {
            console.error(err);
        };
    });
    if (full !== 1 || permissions < TEACHER_PERMISSIONS) {
        amount = Math.ceil(amount / 2);
    };
    database.run(`UPDATE users SET digipogs = digipogs + ${amount} WHERE id = '${to}'`, (err) => {
        if (err) {
            console.error(err);
        };
    });
    database.run(`INSERT INTO transactions (from, to, digipogs, app, reason, date) VALUES (?, ?, ?, ?, ?, ?)`, [
        from,
        to,
        amount,
        app,
        reason,
        // MM/DD/YYYY HH:MM:SS AM/PM EST
        new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
    ], (err) => {
        if (err) {
            console.error(err);
        };
    });
};

module.exports = {
    transferDigipogs
}