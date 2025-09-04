const { database } = require('../modules/database');

module.exports = {
    run(socket) {
        socket.on('transfer', (data) => {
            const { from, to, amount, pin, reason } = data;
            // Validate input
            if (!from || !to || !amount || !pin || !reason) {
                return socket.emit('transferResponse', { success: false, message: 'Missing required fields.' });
            }
            if (amount <= 0) {
                return socket.emit('transferResponse', { success: false, message: 'Amount must be greater than zero.' });
            }
            if (from === to) {
                return socket.emit('transferResponse', { success: false, message: 'Cannot transfer to the same account.' });
            }
            
            // Begin transaction
            database.serialize(() => {
                database.get('SELECT balance, pin FROM users WHERE id = ?', [from], (err, fromUser) => {
                    // Check for errors and validate sender
                    if (err) {
                        return socket.emit('transferResponse', { success: false, message: 'Database error.' });
                    }
                    if (!fromUser) {
                        return socket.emit('transferResponse', { success: false, message: 'Sender account not found.' });
                    }
                    if (fromUser.pin !== pin) {
                        return socket.emit('transferResponse', { success: false, message: 'Invalid PIN.' });
                    }
                    if (fromUser.balance < amount) {
                        return socket.emit('transferResponse', { success: false, message: 'Insufficient funds.' });
                    }

                    database.get('SELECT balance FROM users WHERE id = ?', [to], (err, toUser) => {
                        // Check for errors and validate recipient
                        if (err) {
                            return socket.emit('transferResponse', { success: false, message: 'Database error.' });
                        }
                        if (!toUser) {
                            return socket.emit('transferResponse', { success: false, message: 'Recipient account not found.' });
                        }

                        // Perform the transfer
                        const newFromBalance = fromUser.balance - amount;
                        const newToBalance = toUser.balance + amount * .95; // Deduct 5% fee

                        // Set up respective update promises
                        const updateFrom = new Promise((resolve, reject) => {
                            database.run('UPDATE users SET balance = ? WHERE id = ?', [newFromBalance, from], function(err) {
                                if (err) return reject(err);
                                resolve();
                            });
                        });

                        const updateTo = new Promise((resolve, reject) => {
                            database.run('UPDATE users SET balance = ? WHERE id = ?', [newToBalance, to], function(err) {
                                if (err) return reject(err);
                                resolve();
                            });
                        });

                        // Execute both updates and respond accordingly and emit response
                        Promise.all([updateFrom, updateTo])
                            .then(() => {
                                d
                                socket.emit('transferResponse', { success: true, message: 'Transfer successful.' });
                            })
                            .catch(() => {
                                socket.emit('transferResponse', { success: false, message: 'Transfer failed due to database error.' });
                            });
                    });
                });
            });

        });
    }
}