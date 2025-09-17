module.exports = {
    run(app) {
        app.post("/api/transferDigipogs", (req, res) => {
            const { from, to, amount, pin, reason = "" } = req.body;
            // Validate input
            if (!from || !to || !amount || !pin || !reason) {
                return res.status(400).json({ success: false, message: "Missing required fields." });
            } else if (amount <= 0) {
                return res.status(400).json({ success: false, message: "Amount must be greater than zero." });
            } else if (from === to) {
                return res.status(400).json({ success: false, message: "Cannot transfer to the same account." });
            }
            // Begin transaction
            database.serialize(() => {
                database.get("SELECT * FROM users WHERE id = ?", [from], (err, fromUser) => {
                    // Check for errors and validate sender
                    if (err) {
                        return res.status(400).json({ success: false, message: "Database error." });
                    } else if (!fromUser) {
                        return res.status(400).json({ success: false, message: "Sender account not found." });
                    } else if (fromUser.pin !== pin) {
                        return res.status(400).json({ success: false, message: "Invalid PIN." });
                    } else if (fromUser.digipogs < amount) {
                        return res.status(400).json({ success: false, message: "Insufficient funds." });
                    }

                    database.get("SELECT * FROM users WHERE id = ?", [to], (err, toUser) => {
                        // Check for errors and validate recipient
                        if (err) {
                            return res.status(400).json({ success: false, message: "Database error." });
                        } else if (!toUser) {
                            return res.status(400).json({ success: false, message: "Recipient account not found." });
                        }

                        // Perform the transfer
                        const newFromBalance = fromUser.digipogs - amount;
                        const newToBalance = toUser.digipogs + amount * 0.95; // Deduct 5% fee

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
                                        res.status(200).json({ success: true, message: "Transfer successful, but failed to log transaction." });
                                    } else {
                                        res.status(200).json({ success: true, message: "Transfer successful." });
                                    }
                                });
                            })
                            .catch(() => {
                                res.status(400).json({ success: false, message: "Transfer failed due to database error." });
                            });
                    });
                });
            });
        });
    }
}