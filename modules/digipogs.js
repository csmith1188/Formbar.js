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
        } catch (logErr) {
            logger.log('error', logErr.stack || logErr);
            return { success: true, message: "Award succeeded, but failed to log transaction." };
        }

        return { success: true, message: "Digipogs awarded successfully." };
    } catch (err) {
        logger.log('error', err.stack);
        return { success: false, message: "Database error." };
    }
}

async function transferDigipogs(transferData) {
    try {
        const { from, to, pin, reason = "" } = transferData;
        const amount = Math.ceil(transferData.amount); // Ensure amount is an integer

        if (!from || !to || !amount || !pin || reason === undefined) {
            return { success: false, message: "Missing required fields." };
        } else if (amount <= 0) {
            return { success: false, message: "Amount must be greater than zero." };
        } else if (from === to) {
            return { success: false, message: "Cannot transfer to the same account." };
        }

        const fromUser = await dbGet("SELECT * FROM users WHERE id = ?", [from]);
        if (!fromUser) {
            return { success: false, message: "Sender account not found." };
        } else if (fromUser.pin != pin) {
            return { success: false, message: "Invalid PIN." };
        } else if (fromUser.digipogs < amount) {
            return { success: false, message: "Insufficient funds." };
        }

        const toUser = await dbGet("SELECT * FROM users WHERE id = ?", [to]);
        if (!toUser) {
            return { success: false, message: "Recipient account not found." };
        }

        const newFromBalance = fromUser.digipogs - amount;
        const newToBalance = Math.floor(toUser.digipogs + amount * .95); // 5% fee. Math.floor to avoid fractional digipogs

        try {
            await Promise.all([
                dbRun("UPDATE users SET digipogs = ? WHERE id = ?", [newFromBalance, from]),
                dbRun("UPDATE users SET digipogs = ? WHERE id = ?", [newToBalance, to])
            ]);
        } catch (updateErr) {
            logger.log('error', updateErr.stack || updateErr);
            return { success: false, message: "Transfer failed due to database error." };
        }

        try {
            await dbRun("INSERT INTO transactions (from_user, to_user, amount, reason, date) VALUES (?, ?, ?, ?, ?)", [from, to, amount, reason, Date.now()]);
        } catch (logErr) {
            logger.log('error', logErr.stack || logErr);
            return { success: true, message: "Transfer successful, but failed to log transaction." };
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