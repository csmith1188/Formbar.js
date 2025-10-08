const { dbGet, dbRun } = require("./database");
const { TEACHER_PERMISSIONS } = require("./permissions");
const { logger } = require("./logger");

// awardDigipogsResponse
// transferResponse
async function awardDigipogs(awardData) {
    try {
        const { from, to } = awardData;
        const amount = Math.ceil(awardData.amount); // Ensure amount is an integer
        const reason = "Awarded";

        if (!from || !to || !amount) {
            return { success: false, message: "Missing required fields." };
        } else if (amount <= 0) {
            return { success: false, message: "Amount must be greater than zero." };
        }

        const fromUser = await dbGet("SELECT * FROM users WHERE id = ?", [from]);
        if (!fromUser) {
            return { success: false, message: "Sender account not found." };
        } else if (fromUser.permissions < TEACHER_PERMISSIONS) {
            return { success: false, message: "Insufficient permissions." };
        }

        const toUser = await dbGet("SELECT * FROM users WHERE id = ?", [to]);
        if (!toUser) {
            return { success: false, message: "Recipient account not found." };
        }

        const newBalance = toUser.digipogs + amount;
        await dbRun("UPDATE users SET digipogs = ? WHERE id = ?", [newBalance, to]);

        try {
            await dbRun("INSERT INTO transactions (from_user, to_user, amount, reason, date) VALUES (?, ?, ?, ?, ?)", [from, to, amount, reason, Date.now()]);
        } catch (err) {
            logger.log('error', err.stack || err);
            return { success: true, message: "Award succeeded, but failed to log transaction." };
        }

        return { success: true, message: "Digipogs awarded successfully." };
    } catch (err) {
        logger.log('error', err.stack);
        return { success: false, message: "Database error." };
    }
}

async function transferDigipogs(transferData, pool = false) {
    try {
        const { from, to, pin, reason = "" } = transferData;
        const amount = Math.floor(transferData.amount); // Ensure amount is an integer

        // Validate input
        if (!from || !to || !amount || !pin || reason === undefined) {
            return { success: false, message: "Missing required fields." };
        } else if (amount <= 0) {
            return { success: false, message: "Amount must be greater than zero." };
        } else if (from === to) {
            return { success: false, message: "Cannot transfer to the same account." };
        }

        // Fetch sender
        const fromUser = await dbGet("SELECT * FROM users WHERE id = ?", [from]);
        if (!fromUser) {
            return { success: false, message: "Sender account not found." };
        // Validate PIN and funds
        } else if (fromUser.pin != pin) {
            return { success: false, message: "Invalid PIN." };
        } else if (fromUser.digipogs < amount) {
            return { success: false, message: "Insufficient funds." };
        }

        // Calculate taxed amount
        const taxedAmount = Math.floor(amount * 0.9) > 1 ? Math.floor(amount * 0.9) : 1; // Ensure at least 1 digipog is transferred after tax
        // If transferring to a pool (e.g., company pool)
        if (pool) {
            // If transferring to a pool, ensure the pool exists and has members
            const pool = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [to]);
            if (!pool) return { success: false, message: "Recipient pool not found." };
            dbRun("UPDATE digipog_pools SET amount = amount + ? WHERE id = ?", [taxedAmount, to]);

            try {
                await dbRun("UPDATE users SET digipogs = digipogs - ? WHERE id = ?", [amount, from]);
            } catch (err) {
                logger.log('error', err.stack || err);
                return { success: false, message: "Transfer failed due to database error." };
            }
            try {
                await dbRun("INSERT INTO transactions (from_user, to_user, pool, amount, reason, date) VALUES (?, ?, ?, ?, ?, ?)", [from, null, to, amount, reason, Date.now()]);
            } catch (err) {
                logger.log('error', err.stack || err);
                return { success: true, message: "Transfer successful, but failed to log transaction." };
            }
        // Normal user-to-user transfer
        } else {
            const toUser = await dbGet("SELECT * FROM users WHERE id = ?", [to]);
            if (!toUser) {
                return { success: false, message: "Recipient account not found." };
            }
            
            const newFromBalance = fromUser.digipogs - amount;
            const newToBalance = Math.ceil(toUser.digipogs + taxedAmount);
            
            try {
                await Promise.all([
                    dbRun("UPDATE users SET digipogs = ? WHERE id = ?", [newFromBalance, from]),
                    dbRun("UPDATE users SET digipogs = ? WHERE id = ?", [newToBalance, to])
                ]);
            } catch (err) {
                logger.log('error', err.stack || err);
                return { success: false, message: "Transfer failed due to database error." };
            }
    
            try {
                await dbRun("INSERT INTO transactions (from_user, to_user, pool, amount, reason, date) VALUES (?, ?, ?, ?, ?)", [from, to, null, amount, reason, Date.now()]);
            } catch (err) {
                logger.log('error', err.stack || err);
                return { success: true, message: "Transfer successful, but failed to log transaction." };
            }
        }
        // Add the tax to the dev pool (id 0) if it exists
        const devPool = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [0]); 
        if (devPool) {
            const newDevPoolAmount = devPool.amount + (amount - taxedAmount);
            await dbRun("UPDATE digipog_pools SET amount = ? WHERE id = ?", [newDevPoolAmount, 0]);
        }


        return { success: true, message: "Transfer successful." };
    } catch (err) {
        logger.log('error', err.stack);
        return { success: false, message: "Database error." };
    }
}

module.exports = {
    awardDigipogs,
    transferDigipogs
}