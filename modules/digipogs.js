const { database, dbGet} = require('./database');
const { TEACHER_PERMISSIONS } = require('./permissions');
// The percentage of digipogs lost during a transfer
// For example, if the loss rate is 0.3, a user will only recieve 30% of the transferred pogs. Should always be less than 1 and greater than 0.
const DIGIPOG_LOSS_RATE = 0.5;

async function transferDigipogs(from, to, amount, app = 'None', reason = 'Transfer') {
    try {
        +from;
        +to;
        +amount;
        const fromBalance = await dbGet('SELECT digipogs FROM users WHERE id = ?', [from]);
        const permissions = await dbGet('SELECT permissions FROM users WHERE id = ?', [from]);

        // If the user does not have enough digipogs and their permissions are less than a teacher, log the transaction and return false
        if (fromBalance < amount && permissions < TEACHER_PERMISSIONS) {
            // Log the transaction
            database.run(`INSERT INTO transactions ("from", "to", digipogs, app, reason, date) VALUES (?, ?, ?, ?, ?, ?)`, [
                from,
                to,
                0,
                app,
                `Insufficient Funds: ${reason} [Amount of: ${amount}]`,
                // MM/DD/YYYY HH:MM:SS AM/PM EST
                new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
            ], (err) => {
                if (err) {
                    console.error(err);
                };
            });
            return false;
        };
        // If the user's permissions are less than a teacher, remove pogs from the sender and half the amount
        if (permissions < TEACHER_PERMISSIONS) {
            // Remove the digipogs from the sender
            database.run(`UPDATE users SET digipogs = digipogs - ${amount} WHERE id = '${from}'`, (err) => {
                if (err) {
                    console.error(err);
                };
            });
            amount = Math.ceil(amount * DIGIPOG_LOSS_RATE);
        }
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
        return true;
    } catch (err) {
        logger.log('error', err.stack);
    }
}

module.exports = {
    transferDigipogs
}