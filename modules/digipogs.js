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
    // Remove the digipogs from the sender
    database.run(`UPDATE users SET digipogs = digipogs - ${amount} WHERE id = '${from}'`, (err) => {
        if (err) {
            console.error(err);
        };
    });
    // If the full flag is not set, or the flag is not set and the the permissions of the sender are below a teacher, give half the amount
    if (full !== 1 ) {
        amount = Math.ceil(amount / 2);
    } else if (permissions < TEACHER_PERMISSIONS) {
        amount = Math.ceil(amount / 2);
    };
    // Add the digipogs to the receiver
    database.run(`UPDATE users SET digipogs = digipogs + ${amount} WHERE id = '${to}'`, (err) => {
        if (err) {
            console.error(err);
        };
    });
    // Log the transaction
    database.run(`INSERT INTO transactions ("from", "to", digipogs, app, reason, date) VALUES (?, ?, ?, ?, ?, ?)`, [
        from,
        to,
        full !== 1 || permissions < TEACHER_PERMISSIONS ? amount : amount * 2,
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