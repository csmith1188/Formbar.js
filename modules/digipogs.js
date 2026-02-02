const { dbGet, dbRun } = require("./database");
const { TEACHER_PERMISSIONS } = require("./permissions");
const { logger } = require("./logger");
const { classInformation } = require("./class/classroom");
const { compare } = require("./crypto");

// Import rate limiting configuration
const { rateLimit } = require("./config");

// Store failed transaction attempts
const failedAttempts = new Map(); // Structure: userId -> { attempts: [{timestamp, success}], lockedUntil: timestamp }

/**
 * Clean up old attempt records to prevent memory leaks
 */
function cleanupOldAttempts() {
    const now = Date.now();
    for (const [userId, data] of failedAttempts.entries()) {
        // Remove attempts outside the sliding window
        if (data.attempts) {
            data.attempts = data.attempts.filter((attempt) => now - attempt.timestamp < rateLimit.attemptWindow);
        }

        // Remove the user entry entirely if no recent attempts and not locked
        if ((!data.attempts || data.attempts.length === 0) && (!data.lockedUntil || data.lockedUntil < now)) {
            failedAttempts.delete(userId);
        }
    }
}

// Run cleanup every 5 minutes
setInterval(cleanupOldAttempts, 5 * 60 * 1000);

/**
 * Check if a user is rate limited
 * @param {number} userId - The user ID attempting the transfer
 * @returns {Object} - { allowed: boolean, message: string, waitTime: number }
 */
function checkRateLimit(userId) {
    const now = Date.now();
    const userAttempts = failedAttempts.get(userId);

    if (!userAttempts) {
        // First attempt, initialize tracking
        failedAttempts.set(userId, { attempts: [], lockedUntil: null });
        return { allowed: true };
    }

    // Check if user is currently locked out
    if (userAttempts.lockedUntil && userAttempts.lockedUntil > now) {
        const waitTime = Math.ceil((userAttempts.lockedUntil - now) / 1000);
        return {
            allowed: false,
            message: `Account temporarily locked due to too many failed attempts. Try again in ${waitTime} seconds.`,
            waitTime: waitTime,
        };
    }

    // Clear lockout if it has expired
    if (userAttempts.lockedUntil && userAttempts.lockedUntil <= now) {
        userAttempts.lockedUntil = null;
        userAttempts.attempts = [];
    }

    // Check for spam (attempts too close together)
    if (userAttempts.attempts.length > 0) {
        const lastAttempt = userAttempts.attempts[userAttempts.attempts.length - 1];
        const timeSinceLastAttempt = now - lastAttempt.timestamp;

        if (timeSinceLastAttempt < rateLimit.minDelayBetweenAttempts) {
            return {
                allowed: false,
                message: "Please wait before attempting another transfer.",
                waitTime: Math.ceil((rateLimit.minDelayBetweenAttempts - timeSinceLastAttempt) / 1000),
            };
        }
    }

    // Filter attempts within the sliding window
    const recentAttempts = userAttempts.attempts.filter((attempt) => now - attempt.timestamp < rateLimit.attemptWindow);
    userAttempts.attempts = recentAttempts;

    // Count only failed attempts
    const failedCount = recentAttempts.filter((attempt) => !attempt.success).length;

    // Check if adding one more failed attempt would exceed the limit
    if (failedCount >= rateLimit.maxAttempts) {
        // Lock the account
        userAttempts.lockedUntil = now + rateLimit.lockoutDuration;
        const waitTime = Math.ceil(rateLimit.lockoutDuration / 1000);

        return {
            allowed: false,
            message: `Too many failed attempts. Account temporarily locked for ${Math.ceil(waitTime / 60)} minutes.`,
            waitTime: waitTime,
        };
    }

    // Log current failure count for debugging
    logger.log("info", `User ${userId} has ${failedCount} failed attempts (max: ${rateLimit.maxAttempts})`);

    return { allowed: true };
}

/**
 * Record a transfer attempt (success or failure)
 * @param {number} userId - The user ID
 * @param {boolean} success - Whether the attempt was successful
 */
function recordAttempt(userId, success) {
    const now = Date.now();
    const userAttempts = failedAttempts.get(userId) || { attempts: [], lockedUntil: null };

    userAttempts.attempts.push({ timestamp: now, success: success });

    // If successful, clear the failed attempts history
    if (success) {
        userAttempts.attempts = userAttempts.attempts.filter((attempt) => attempt.success);
        userAttempts.lockedUntil = null;
    }

    failedAttempts.set(userId, userAttempts);
}

async function awardDigipogs(awardData, session) {
    try {
        const { from, to } = awardData;
        const amount = Math.ceil(awardData.amount); // Ensure amount is an integer
        const reason = "Awarded";

        if (!from || !to || !amount) {
            return { success: false, message: "Missing required fields." };
        } else if (from !== session.userId) {
            return { success: false, message: "Sender ID does not match session user." };
        }

        const fromUser = await dbGet("SELECT * FROM users WHERE id = ?", [from]);

        // Check if the awarding user is a teacher in a class
        if (!fromUser || !fromUser.email || !classInformation.users[fromUser.email] || !classInformation.users[fromUser.email].activeClass) {
            return { success: false, message: "Sender is not currently active in any class." };
        }
        let classPermissionsRow = await dbGet("SELECT permissions FROM classusers WHERE classId = ? AND studentId = ?", [
            classInformation.users[fromUser.email].activeClass,
            from,
        ]);
        let classPermissions = classPermissionsRow ? classPermissionsRow.permissions : undefined;
        // Owners are not in the classusers table, so we need to check if they are the owner of the class
        if (classPermissions === undefined) {
            const classOwnerId = await dbGet("SELECT owner FROM classroom WHERE id = ?", [classInformation.users[fromUser.email].activeClass]);
            if (classOwnerId && classOwnerId.owner === from) {
                classPermissions = TEACHER_PERMISSIONS;
            }
        }

        if (!fromUser) {
            return { success: false, message: "Sender account not found." };
        } else if (classPermissions == null) {
            return { success: false, message: "Insufficient permissions." };
        } else if (classPermissions < TEACHER_PERMISSIONS) {
            return { success: false, message: "Insufficient permissions." };
        }

        const toUser = await dbGet("SELECT * FROM users WHERE id = ?", [to]);
        if (!toUser) {
            return { success: false, message: "Recipient account not found." };
        }

        const newBalance = toUser.digipogs + amount;
        await dbRun("UPDATE users SET digipogs = ? WHERE id = ?", [newBalance, to]);

        try {
            await dbRun("INSERT INTO transactions (from_user, to_user, pool, amount, reason, date) VALUES (?, ?, ?, ?, ?, ?)", [
                from,
                to,
                null,
                amount,
                reason,
                Date.now(),
            ]);
        } catch (err) {
            logger.log("error", err.stack || err);
            return { success: true, message: "Award succeeded, but failed to log transaction." };
        }

        return { success: true, message: "Digipogs awarded successfully." };
    } catch (err) {
        logger.log("error", err.stack);
        return { success: false, message: "Database error." };
    }
}

async function transferDigipogs(transferData) {
    try {
        const { from, to, pin, reason = "", pool = false } = transferData;
        const amount = Math.floor(transferData.amount); // Ensure amount is an integer

        // Ensure that the user is not transferring to themselves
        if (from == to) {
            return { success: false, message: "You cannot transfer digipogs to the same account." };
        }

        // Validate input
        if (!from || (!to && to !== 0) || !amount || !pin || reason === undefined) {
            return { success: false, message: "Missing required fields." };
        } else if (amount <= 0) {
            return { success: false, message: "Amount must be greater than zero." };
        } else if (from === to && !pool) {
            return { success: false, message: "Cannot transfer to the same account." };
        }

        // Check rate limiting
        const rateLimitCheck = checkRateLimit(from);
        if (!rateLimitCheck.allowed) {
            return {
                success: false,
                message: rateLimitCheck.message,
                rateLimited: true,
                waitTime: rateLimitCheck.waitTime,
            };
        }

        // Fetch sender
        const fromUser = await dbGet("SELECT * FROM users WHERE id = ?", [from]);
        if (!fromUser) {
            recordAttempt(from, false);
            return { success: false, message: "Sender account not found." };
        }

        // Validate stored PIN exists
        if (!fromUser.pin) {
            recordAttempt(from, false);
            return { success: false, message: "Account PIN not configured." };
        }

        // Validate PIN and funds
        const pinString = String(pin);
        const isPinValid = await compare(pinString, fromUser.pin);
        if (!isPinValid) {
            // Record the failed attempt
            recordAttempt(from, false);
            return { success: false, message: "Invalid PIN." };
        } else if (fromUser.digipogs < amount) {
            // Even with correct PIN, record as failed if insufficient funds
            recordAttempt(from, false);
            return { success: false, message: "Insufficient funds." };
        }

        // Calculate taxed amount for all transfers
        const taxedAmount = Math.floor(amount * 0.9) > 1 ? Math.floor(amount * 0.9) : 1; // Ensure at least 1 digipog is transferred after tax

        // If transferring to a pool (e.g., company pool)
        if (pool) {
            // If transferring to a pool, ensure the pool exists and has members
            const pool = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [to]);
            if (!pool) {
                recordAttempt(from, false);
                return { success: false, message: "Recipient pool not found." };
            }

            // Perform user deduction and pool update atomically
            try {
                await dbRun("BEGIN TRANSACTION");
                // Deduct full amount from user
                await dbRun("UPDATE users SET digipogs = digipogs - ? WHERE id = ?", [amount, from]);
                // Credit taxed amount to pool
                await dbRun("UPDATE digipog_pools SET amount = amount + ? WHERE id = ?", [taxedAmount, to]);
                await dbRun("COMMIT");
            } catch (err) {
                try {
                    await dbRun("ROLLBACK");
                } catch (rollbackErr) {
                    logger.log("error", rollbackErr.stack || rollbackErr);
                }
                logger.log("error", err.stack || err);
                recordAttempt(from, false);
                return { success: false, message: "Transfer failed due to database error." };
            }
            try {
                await dbRun("INSERT INTO transactions (from_user, to_user, pool, amount, reason, date) VALUES (?, ?, ?, ?, ?, ?)", [
                    from,
                    null,
                    to,
                    amount,
                    reason,
                    Date.now(),
                ]);
            } catch (err) {
                logger.log("error", err.stack || err);

                // Record successful attempt
                recordAttempt(from, true);
                return { success: true, message: "Transfer successful, but failed to log transaction." };
            }
        } else {
            // Normal user-to-user transfer
            const toUser = await dbGet("SELECT * FROM users WHERE id = ?", [to]);
            if (!toUser) {
                recordAttempt(from, false);
                return { success: false, message: "Recipient account not found." };
            }

            const newFromBalance = fromUser.digipogs - amount;
            const newToBalance = Math.ceil(toUser.digipogs + taxedAmount);

            try {
                await dbRun("BEGIN TRANSACTION");
                await dbRun("UPDATE users SET digipogs = ? WHERE id = ?", [newFromBalance, from]);
                await dbRun("UPDATE users SET digipogs = ? WHERE id = ?", [newToBalance, to]);
                await dbRun("COMMIT");
            } catch (err) {
                logger.log("error", err.stack || err);
                recordAttempt(from, false);
                return { success: false, message: "Transfer failed due to database error." };
            }

            try {
                await dbRun("INSERT INTO transactions (from_user, to_user, pool, amount, reason, date) VALUES (?, ?, ?, ?, ?, ?)", [
                    from,
                    to,
                    null,
                    amount,
                    reason,
                    Date.now(),
                ]);
            } catch (err) {
                logger.log("error", err.stack || err);

                // Record successful attempt
                recordAttempt(from, true);
                return { success: true, message: "Transfer successful, but failed to log transaction." };
            }
        }

        // Add the tax to the dev pool (id 0) if it exists
        const devPool = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [0]);
        if (devPool) {
            const newDevPoolAmount = devPool.amount + (amount - taxedAmount);
            await dbRun("UPDATE digipog_pools SET amount = ? WHERE id = ?", [newDevPoolAmount, 0]);
        }

        // Record successful attempt
        recordAttempt(from, true);
        return { success: true, message: "Transfer successful." };
    } catch (err) {
        logger.log("error", err.stack);
        return { success: false, message: "Database error." };
    }
}

module.exports = {
    awardDigipogs,
    transferDigipogs,
};
