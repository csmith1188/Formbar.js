const { dbGet, dbRun } = require("./database");
const { TEACHER_PERMISSIONS } = require("./permissions");
const { logger } = require("./logger");
const { getClassIDFromCode } = require("./class/classroom");
const { compare } = require("./crypto");

// Import rate limiting configuration
const { rateLimit } = require("./config");

// Store failed transaction attempts
const failedAttempts = new Map(); // Structure: accountID -> { attempts: [{timestamp, success}], lockedUntil: timestamp }

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
 * Check if an account (user or pool) is rate limited
 * @param {string} accountId - The account ID attempting the transfer (e.g., 'user-123' or 'pool-456')
 * @returns {Object} - { allowed: boolean, message: string, waitTime: number }
 */
function checkRateLimit(accountId) {
    const now = Date.now();
    const userAttempts = failedAttempts.get(accountId);

    if (!userAttempts) {
        // First attempt, initialize tracking
        failedAttempts.set(accountId, { attempts: [], lockedUntil: null });
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
    logger.log("info", `Account ${accountId} has ${failedCount} failed attempts (max: ${rateLimit.maxAttempts})`);

    return { allowed: true };
}

/**
 * Record a transfer attempt (success or failure)
 * @param {string} accountId - The account ID (e.g., 'user-123' or 'pool-456')
 * @param {boolean} success - Whether the attempt was successful
 */
function recordAttempt(accountId, success) {
    const now = Date.now();
    const userAttempts = failedAttempts.get(accountId) || { attempts: [], lockedUntil: null };

    userAttempts.attempts.push({ timestamp: now, success: success });

    // If successful, clear the failed attempts history
    if (success) {
        userAttempts.attempts = userAttempts.attempts.filter((attempt) => attempt.success);
        userAttempts.lockedUntil = null;
    }

    failedAttempts.set(accountId, userAttempts);
}

async function awardDigipogs(awardData, user) {
    try {
        const from = user.userID;
        const to = awardData.to;
        const amount = Math.ceil(awardData.amount); // Ensure amount is an integer
        const reason = awardData.reason || "Awarded";

        // Backward compatibility
        if (!to.id && !to.code) {
            to.id = to;
            to.type = 'user';
        }

        if (!from || !to || !amount) {
            return { success: false, message: "Missing required fields." };
        } else if (to.type !== 'user' && to.type !== 'pool' && to.type !== 'class') {
            return { success: false, message: "Invalid recipient type." };
        } else if (amount <= 0) {
            return { success: false, message: "Amount must be greater than zero." };
        }

        const accountId = `award-${from}`;
        const rateLimitCheck = checkRateLimit(accountId);
        if (!rateLimitCheck.allowed) {
            return {
                success: false,
                message: rateLimitCheck.message,
                rateLimited: true,
                waitTime: rateLimitCheck.waitTime,
            };
        }

        const fromUser = await dbGet("SELECT email, permissions FROM users WHERE id = ?", [from]);
        if (!fromUser || !fromUser.email) {
            recordAttempt(accountId, false);
            return { success: false, message: "Sender account not found." };
        }

        if (to.type === 'class') {
            if (to.code) {
                to.id = await getClassIDFromCode(to.code);
                if (!to.id) {
                    recordAttempt(accountId, false);
                    return { success: false, message: "Invalid class code." };
                }
            } else if (!to.id) {
                recordAttempt(accountId, false);
                return { success: false, message: "Missing class identifier." };
            }
            
            // Fetch class info and check sender permissions
            const classInfo = await dbGet("SELECT c.id, c.owner FROM classroom c WHERE c.id = ?",[to.id]);
            if (!classInfo) {
                recordAttempt(accountId, false)
                return { success: false, message: "Recipient class not found." };
            }
            
            // Check sender permissions: either is owner or has teacher permissions in class
            let classPermissions = 0;
            if (classInfo.owner === from) {
                classPermissions = TEACHER_PERMISSIONS;
            } else {
                const permRow = await dbGet(
                    "SELECT permissions FROM classusers WHERE classId = ? AND studentId = ?",
                    [to.id, from]
                );
                classPermissions = permRow ? permRow.permissions : 0;
            }
            
            if (classPermissions < TEACHER_PERMISSIONS && fromUser.permissions < TEACHER_PERMISSIONS) {
                recordAttempt(accountId, false);
                return { success: false, message: "Sender does not have permission to award to this class." };
            }
            
            //increment all class members' digipogs
            await dbRun("UPDATE users SET digipogs = digipogs + ? WHERE id IN (SELECT studentId FROM classusers WHERE classId = ?) OR id = ?",[
                amount, 
                to.id, 
                classInfo.owner
            ]
            );
        } else if (to.type === 'pool') {
            if (!to.id) {
                recordAttempt(accountId, false)
                return { success: false, message: "Missing pool identifier." };
            }
            if (fromUser.permissions < TEACHER_PERMISSIONS) {
                recordAttempt(accountId, false);
                return { success: false, message: "Sender does not have permission to award to pools." };
            } 
            const poolInfo = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [to.id]);
            if (!poolInfo) {
                recordAttempt(accountId, false);
                return { success: false, message: "Recipient pool not found." };
            }
            await dbRun("UPDATE digipog_pools SET amount = amount + ? WHERE id = ?", [amount, to.id]);
        } else if (to.type === 'user') {
            // Verify recipient exists
            const toUser = await dbGet("SELECT id FROM users WHERE id = ?", [to.id]);
            if (!toUser) {
                recordAttempt(accountId, false);
                return { success: false, message: "Recipient account not found." };
            }
            
            // Check permissions if sender is not a global teacher
            if (fromUser.permissions < TEACHER_PERMISSIONS) {
                // Check if sender is a teacher/owner in any class the recipient is in
                const hasPermission = await dbGet(
                    "SELECT 1 FROM classusers cu1 INNER JOIN classroom c ON c.id = cu1.classId WHERE cu1.studentId = ? AND (cu1.classId IN (SELECT classId FROM classusers cu2 WHERE cu2.studentId = ? AND cu2.permissions >= ?) OR c.owner = ?)",
                    [to.id, from, TEACHER_PERMISSIONS, from]
                );
                if (!hasPermission) {
                    recordAttempt(accountId, false);
                    return { success: false, message: "Sender does not have permission to award to this user." };
                }
            }
            
            await dbRun("UPDATE users SET digipogs = digipogs + ? WHERE id = ?", [amount, to.id]);
        }
        try {
            await dbRun("INSERT INTO transactions (from_id, to_id, from_type, to_type, amount, reason, date) VALUES (?, ?, ?, ?, ?, ?, ?)", [
                from,
                to.id,
                "award",
                to.type,
                amount,
                reason,
                Date.now(),
            ]);
        } catch (err) {
            logger.log("error", err.stack || err);
            return { success: true, message: "Award succeeded, but failed to log transaction." };
        }
        recordAttempt(accountId, true);
        return { success: true, message: "Digipogs awarded successfully." };
    } catch (err) {
        logger.log("error", err.stack);
        return { success: false, message: "Database error." };
    }
}

async function transferDigipogs(transferData) {
    try {
        const { from, to, pin, reason = "", pool } = transferData;
        const amount = Math.floor(transferData.amount); // Ensure amount is an integer

        // Backward compatibility
        let deprecatedFormatUsed = false;
        if (!from.id) {
            from.id = from;
            from.type = 'user'; 
            to.id = pool ? pool : to;
            to.type = pool ? 'pool' : 'user';
            deprecatedFormatUsed = true;
        }
        if (!from.type) {
            from.type = 'user';
        }
        if (!to.type) {
            to.type = 'user';
        }

        // Validate input structure
        if (!from || !from.id || !to || !to.id || !amount || reason === undefined || !pin) {
            return { success: false, message: "Missing required fields." };
        } else if (amount <= 0) {
            return { success: false, message: "Amount must be greater than zero." };
        } else if (from.type === to.type && from.id === to.id) {
            return { success: false, message: "Cannot transfer to the same account." };
        } else if ((from.type !== 'user' && from.type !== 'pool') || (to.type !== 'user' && to.type !== 'pool')) {
            return { success: false, message: "Invalid sender or recipient type." };
        }

        // Check rate limits for the sender
        const accountId = `${from.type}-${from.id}`;
        const rateLimitCheck = checkRateLimit(accountId);
        if (!rateLimitCheck.allowed) {
            return {
                success: false,
                message: rateLimitCheck.message,
                rateLimited: true,
                waitTime: rateLimitCheck.waitTime,
            };
        }

        // Fetch sender account
        let fromAccount;
        if (from.type === 'user') {
            fromAccount = await dbGet("SELECT * FROM users WHERE id = ?", [from.id]);
            if (!fromAccount) {
                recordAttempt(accountId, false);
                return { success: false, message: "Sender account not found." };
            }
        } else {
            fromAccount = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [from.id]);
            const poolUser = await dbGet("SELECT user_id FROM digipog_pool_users WHERE pool_id = ? AND owner = 1", [from.id]);
            if (!fromAccount) {
                recordAttempt(accountId, false);
                return { success: false, message: "Sender pool not found." };
            }
            const poolOwner = await dbGet("SELECT pin FROM users WHERE id = ?", [poolUser.user_id]);
            fromAccount.pin = poolOwner.pin; // Use the pool owner's PIN for validation
        }

        // PIN validation
        if (!fromAccount.pin) {
            recordAttempt(accountId, false);
            return { success: false, message: "Account PIN not configured." };
        }

        const pinString = String(pin);
        const isPinValid = await compare(pinString, fromAccount.pin);
        if (!isPinValid) {
            recordAttempt(accountId, false);
            return { success: false, message: "Invalid PIN." };
        }

        // Check funds
        const fromBalance = from.type === 'user' ? fromAccount.digipogs : fromAccount.amount;
        if (fromBalance < amount) {
            recordAttempt(accountId, false);
            return { success: false, message: "Insufficient funds." };
        }

        // Calculate tax
        const taxedAmount = Math.floor(amount * 0.9) > 1 ? Math.floor(amount * 0.9) : 1;
        const taxAmount = amount - taxedAmount;

        // Fetch recipient account
        let toAccount;
        if (to.type === 'user') {
            toAccount = await dbGet("SELECT * FROM users WHERE id = ?", [to.id]);
            if (!toAccount) {
                recordAttempt(accountId, false);
                return { success: false, message: "Recipient account not found." };
            }
        } else {
            toAccount = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [to.id]);
            if (!toAccount) {
                recordAttempt(accountId, false);
                return { success: false, message: "Recipient pool not found." };
            }
        }

        // Perform transfer atomically
        try {
            await dbRun("BEGIN TRANSACTION");

            // Deduct from sender
            if (from.type === 'user') {
                await dbRun("UPDATE users SET digipogs = digipogs - ? WHERE id = ?", [amount, from.id]);
            } else {
                await dbRun("UPDATE digipog_pools SET amount = amount - ? WHERE id = ?", [amount, from.id]);
            }

            // Credit to recipient
            if (to.type === 'user') {
                await dbRun("UPDATE users SET digipogs = digipogs + ? WHERE id = ?", [taxedAmount, to.id]);
            } else {
                await dbRun("UPDATE digipog_pools SET amount = amount + ? WHERE id = ?", [taxedAmount, to.id]);
            }

            // Add tax to dev pool (id 0)
            const devPool = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [0]);
            if (devPool) {
                await dbRun("UPDATE digipog_pools SET amount = amount + ? WHERE id = ?", [taxAmount, 0]);
            }

            await dbRun("COMMIT");
        } catch (err) {
            try {
                await dbRun("ROLLBACK");
            } catch (rollbackErr) {
                logger.log("error", rollbackErr.stack || rollbackErr);
            }
            logger.log("error", err.stack || err);
            recordAttempt(accountId, false);
            return { success: false, message: "Transfer failed due to database error." };
        }

        // Log transaction
        try {
            await dbRun(
                "INSERT INTO transactions (from_id, from_type, to_id, to_type, amount, reason, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [from.id, from.type, to.id, to.type, amount, reason, Date.now()]
            );
        } catch (err) {
            logger.log("error", err.stack || err);
            // Don't fail the transfer if logging fails
        }

        // Record successful attempt
        recordAttempt(accountId, true);
        return { success: true, message: `Transfer successful. ${deprecatedFormatUsed ? 'Warning: Deprecated pool transfer format used. See documentation for updated usage.' : ''}` };
    } catch (err) {
        logger.log("error", err.stack);
        return { success: false, message: "Database error." };
    }
}

module.exports = {
    awardDigipogs,
    transferDigipogs,
};
