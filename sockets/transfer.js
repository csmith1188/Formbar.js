const { privateKey } = require("../modules/config");
const { database } = require("../modules/database");
const jwt = require("jsonwebtoken");

module.exports = {
    run(socket) {
        socket.on("transfer", (data) => {
            const { from, to, amount, pin, reason } = data;
            // Validate input
            if (!from || !to || !amount || !pin || !reason) {
                return socket.emit("transferResponse", jwt.sign({ success: false, message: "Missing required fields." }, privateKey, { expiresIn: "1h"}));
            }
            if (amount <= 0) {
                return socket.emit("transferResponse", jwt.sign({ success: false, message: "Amount must be greater than zero." }, privateKey, { expiresIn: "1h"}));
            }
            if (from === to) {
                return socket.emit("transferResponse", jwt.sign({ success: false, message: "Cannot transfer to the same account." }, privateKey, { expiresIn: "1h"}));
            }
            
            // Begin transaction
            database.serialize(() => {
                database.get("SELECT balance, pin FROM users WHERE id = ?", [from], (err, fromUser) => {
                    // Check for errors and validate sender
                    if (err) {
                        return socket.emit("transferResponse", jwt.sign({ success: false, message: "Database error." }, privateKey, { expiresIn: "1h"}));
                    }
                    if (!fromUser) {
                        return socket.emit("transferResponse", jwt.sign({ success: false, message: "Sender account not found." }, privateKey, { expiresIn: "1h"}));
                    }
                    if (fromUser.pin !== pin) {
                        return socket.emit("transferResponse", jwt.sign({ success: false, message: "Invalid PIN." }, privateKey, { expiresIn: "1h"}));
                    }
                    if (fromUser.digipogs < amount) {
                        return socket.emit("transferResponse", jwt.sign({ success: false, message: "Insufficient funds." }, privateKey, { expiresIn: "1h"}));
                    }

                    database.get("SELECT balance FROM users WHERE id = ?", [to], (err, toUser) => {
                        // Check for errors and validate recipient
                        if (err) {
                            return socket.emit("transferResponse", jwt.sign({ success: false, message: "Database error." }, privateKey, { expiresIn: "1h"}));
                        }
                        if (!toUser) {
                            return socket.emit("transferResponse", jwt.sign({ success: false, message: "Recipient account not found." }, privateKey, { expiresIn: "1h"}));
                        }

                        // Perform the transfer
                        const newFromBalance = fromUser.digipogs - amount;
                        const newToBalance = toUser.digipogs + amount * .95; // Deduct 5% fee

                        // Set up respective update promises
                        const updateFrom = new Promise((resolve, reject) => {
                            database.run("UPDATE users SET balance = ? WHERE id = ?", [newFromBalance, from], function(err) {
                                if (err) return reject(err);
                                resolve();
                            });
                        });

                        const updateTo = new Promise((resolve, reject) => {
                            database.run("UPDATE users SET balance = ? WHERE id = ?", [newToBalance, to], function(err) {
                                if (err) return reject(err);
                                resolve();
                            });
                        });

                        // Execute both updates and respond accordingly and emit response
                        Promise.all([updateFrom, updateTo])
                            .then(() => {
                                socket.emit("transferResponse", jwt.sign({ success: true, message: "Transfer successful." }, privateKey, { expiresIn: "1h"}));
                            })
                            .catch(() => {
                                socket.emit("transferResponse", jwt.sign({ success: false, message: "Transfer failed due to database error." }, privateKey, { expiresIn: "1h"}));
                            });
                    });
                });
            });

        });
    }
}