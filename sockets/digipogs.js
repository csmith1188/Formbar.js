const { privateKey } = require("../modules/config");
const { database } = require("../modules/database");
const { TEACHER_PERMISSIONS } = require("../modules/permissions");
const jwt = require("jsonwebtoken");

function jwtSign(payload) {
    return jwt.sign(payload, privateKey, {algorithm: 'RS256'}, { expiresIn: "1h" });
}

module.exports = {
    run(socket) {
        // For those with teacher permissions or higher to add digipogs to a user's account
        socket.on("awardDigipogs", (data) => {
            const { from, to, amount } = data;
            const reason = "Awarded";
            // Validate input
            if (!from || !to || !amount) {
                return socket.emit("awardDigipogsResponse", { success: false, message: "Missing required fields." });
            } else if (amount <= 0) {
                return socket.emit("awardDigipogsResponse", { success: false, message: "Amount must be greater than zero." });
            }
            database.serialize(() => {
                database.get("SELECT * FROM users WHERE id = ?", [from], (err, fromUser) => {
                    // Check for errors and validate sender
                    if (err) {
                        return socket.emit("awardDigipogsResponse", { success: false, message: "Database error." });
                    } else if (!fromUser) {
                        return socket.emit("awardDigipogsResponse", { success: false, message: "Sender account not found." });
                    } else if (fromUser.permissions < TEACHER_PERMISSIONS) {
                        return socket.emit("awardDigipogsResponse", { success: false, message: "Insufficient permissions." });
                    }
                    database.get("SELECT * FROM users WHERE id = ?", [to], (err, toUser) => {
                        // Check for errors and validate recipient
                        if (err) {
                            return socket.emit("awardDigipogsResponse", { success: false, message: "Database error." });
                        } else if (!toUser) {
                            return socket.emit("awardDigipogsResponse", { success: false, message: "Recipient account not found." });
                        }
                        // Update recipient's digipogs
                        const newBalance = toUser.digipogs + amount;
                        database.run("UPDATE users SET digipogs = ? WHERE id = ?", [newBalance, to], function(err) {
                            if (err) {
                                return socket.emit("awardDigipogsResponse", { success: false, message: "Failed to update balance." });
                            }
                        });
                    });
                    // Log the transaction
                    database.run("INSERT INTO transactions (from_user, to_user, amount, reason, date) VALUES (?, ?, ?, ?, ?)", [from, to, amount, reason, Date.now()], (err) => {
                        if (err) {
                            // If logging fails, still consider the award successful but notify of logging failure
                            return socket.emit("awardDigipogsResponse", { success: true, message: "Award succeeded, but failed to log transaction." });
                        }
                        // Emit success response
                        socket.emit("awardDigipogsResponse", { success: true, message: "Digipogs awarded successfully." });
                    });
                });

            });
        });

        // For transferring digipogs between users for third party services
        socket.on("transfer", (data) => {
            const { from, to, amount, pin, reason = "" } = data;
            // Validate input
            if (!from || !to || !amount || !pin || !reason) {
                return socket.emit("transferResponse", jwtSign({ success: false, message: "Missing required fields." }));
            } else if (amount <= 0) {
                return socket.emit("transferResponse", jwtSign({ success: false, message: "Amount must be greater than zero." }));
            } else if (from === to) {
                return socket.emit("transferResponse", jwtSign({ success: false, message: "Cannot transfer to the same account." }));
            }
            
            // Begin transaction
            database.serialize(() => {
                database.get("SELECT * FROM users WHERE id = ?", [from], (err, fromUser) => {
                    // Check for errors and validate sender
                    if (err) {
                        return socket.emit("transferResponse", jwtSign({ success: false, message: "Database error." }));
                    } else if (!fromUser) {
                        return socket.emit("transferResponse", jwtSign({ success: false, message: "Sender account not found." }));
                    } else if (fromUser.pin !== pin) {
                        return socket.emit("transferResponse", jwtSign({ success: false, message: "Invalid PIN." }));
                    } else if (fromUser.digipogs < amount) {
                        return socket.emit("transferResponse", jwtSign({ success: false, message: "Insufficient funds." }));
                    }

                    database.get("SELECT * FROM users WHERE id = ?", [to], (err, toUser) => {
                        // Check for errors and validate recipient
                        if (err) {
                            return socket.emit("transferResponse", jwtSign({ success: false, message: "Database error." }));
                        } else if (!toUser) {
                            return socket.emit("transferResponse", jwtSign({ success: false, message: "Recipient account not found." }));
                        }

                        // Perform the transfer
                        const newFromBalance = fromUser.digipogs - amount;
                        const newToBalance = toUser.digipogs + amount * .95; // Deduct 5% fee

                        // Set up respective update promises
                        const updateFrom = new Promise((resolve, reject) => {
                            database.run("UPDATE users SET digipogs = ? WHERE id = ?", [newFromBalance, from], (err) => {
                                if (err) return reject(err);
                                resolve();
                            });
                        });

                        const updateTo = new Promise((resolve, reject) => {
                            database.run("UPDATE users SET digipogs = ? WHERE id = ?", [newToBalance, to], (err) => {
                                if (err) return reject(err);
                                resolve();
                            });
                        });

                        // Execute both updates and respond accordingly and emit response
                        Promise.all([updateFrom, updateTo])
                            .then(() => {
                                // Log the transaction
                                database.run("INSERT INTO transactions (from_user, to_user, amount, reason, date) VALUES (?, ?, ?, ?, ?)", [from, to, amount, reason, Date.now()], (err) => {
                                    if (err) {
                                        console.error("Failed to log transaction:", err);
                                        // If logging fails, still consider the award successful but notify of logging failure
                                        socket.emit("transferResponse", jwtSign({ success: true, message: "Transfer successful, but failed to log transaction." }));
                                    } else {
                                        socket.emit("transferResponse", jwtSign({ success: true, message: "Transfer successful." }));
                                    }
                                });
                            })
                            .catch(() => {
                                socket.emit("transferResponse", jwtSign({ success: false, message: "Transfer failed due to database error." }));
                            });
                    });
                });
            });

        });
    }
}