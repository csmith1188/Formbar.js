const { database, dbGetAll, dbGet, dbRun } = require("@modules/database");
const { SCOPES, filterScopesByDomain, parseScopesField, TEACHER_PERMISSIONS } = require("@modules/permissions");
const { getClassIDFromCode } = require("@services/classroom-service");
const { getGlobalPermissionLevelForUser } = require("@modules/scope-resolver");
const { hashBcrypt, compareBcrypt } = require("@modules/crypto");
const { digipogRateLimit } = require("@modules/config");
const NotFoundError = require("@errors/not-found-error");
const AppError = require("@errors/app-error");
const { registerItem, addItemToInventory, removeItemFromInventory } = require("@services/inventory-service");

const SHARES_PER_POOL = 100;

// Rate limiting

/**
 * Db Run Changes.
 *
 * @param {*} query - query.
 * @param {*} params - params.
 * @returns {*}
 */
function dbRunChanges(query, params = []) {
    return new Promise((resolve, reject) => {
        database.run(query, params, function (err) {
            if (err) return reject(err);
            resolve(this.changes || 0);
        });
    });
}

const failedAttempts = new Map();

/**
 * Remove expired digipog rate-limit attempts.
 * @returns {void}
 */
function cleanupOldAttempts() {
    const now = Date.now();
    for (const [userId, data] of failedAttempts.entries()) {
        if (data.attempts) {
            data.attempts = data.attempts.filter((attempt) => now - attempt.timestamp < digipogRateLimit.attemptWindow);
        }
        if ((!data.attempts || data.attempts.length === 0) && (!data.lockedUntil || data.lockedUntil < now)) {
            failedAttempts.delete(userId);
        }
    }
}

const cleanupInterval = setInterval(cleanupOldAttempts, 5 * 60 * 1000);
if (typeof cleanupInterval.unref === "function") {
    cleanupInterval.unref();
}

/**
 * Check the award rate limit for an account.
 * @param {string|number} accountId - Account ID.
 * @returns {Object}
 */
function checkRateLimit(accountId) {
    const now = Date.now();
    const userAttempts = failedAttempts.get(accountId);

    if (!userAttempts) {
        failedAttempts.set(accountId, { attempts: [], lockedUntil: null });
        return { allowed: true };
    }

    if (userAttempts.lockedUntil && userAttempts.lockedUntil > now) {
        const waitTime = Math.ceil((userAttempts.lockedUntil - now) / 1000);
        return {
            allowed: false,
            message: `Account temporarily locked due to too many failed attempts. Try again in ${waitTime} seconds.`,
            waitTime,
        };
    }

    if (userAttempts.lockedUntil && userAttempts.lockedUntil <= now) {
        userAttempts.lockedUntil = null;
        userAttempts.attempts = [];
    }

    if (userAttempts.attempts.length > 0) {
        const lastAttempt = userAttempts.attempts[userAttempts.attempts.length - 1];
        const timeSinceLastAttempt = now - lastAttempt.timestamp;
        if (timeSinceLastAttempt < digipogRateLimit.minDelayBetweenAttempts) {
            return {
                allowed: false,
                message: "Please wait before attempting another transfer.",
                waitTime: Math.ceil((digipogRateLimit.minDelayBetweenAttempts - timeSinceLastAttempt) / 1000),
            };
        }
    }

    const recentAttempts = userAttempts.attempts.filter((attempt) => now - attempt.timestamp < digipogRateLimit.attemptWindow);
    userAttempts.attempts = recentAttempts;

    const failedCount = recentAttempts.filter((attempt) => !attempt.success).length;

    if (failedCount >= digipogRateLimit.maxAttempts) {
        userAttempts.lockedUntil = now + digipogRateLimit.lockoutDuration;
        const waitTime = Math.ceil(digipogRateLimit.lockoutDuration / 1000);
        return {
            allowed: false,
            message: `Too many failed attempts. Account temporarily locked for ${Math.ceil(waitTime / 60)} minutes.`,
            waitTime,
        };
    }

    return { allowed: true };
}

/**
 * Record a digipog award attempt.
 * @param {string|number} accountId - Account ID.
 * @param {boolean} success - Whether the attempt succeeded.
 * @returns {void}
 */
function recordAttempt(accountId, success) {
    const now = Date.now();
    const userAttempts = failedAttempts.get(accountId) || { attempts: [], lockedUntil: null };
    userAttempts.attempts.push({ timestamp: now, success });
    if (success) {
        userAttempts.attempts = userAttempts.attempts.filter((attempt) => attempt.success);
        userAttempts.lockedUntil = null;
    }
    failedAttempts.set(accountId, userAttempts);
}

/**
 * Build a user object with global role data.
 * @param {number} userId - userId.
 * @returns {Promise<Object|null>}
 */
async function getComputedGlobalUser(userId) {
    const user = await dbGet("SELECT id, email FROM users WHERE id = ?", [userId]);
    if (!user) {
        return null;
    }

    const roleRows = await dbGetAll(
        `SELECT r.id, r.name, r.scopes
         FROM user_roles ur
         JOIN roles r ON ur.roleId = r.id
         WHERE ur.userId = ? AND ur.classId IS NULL`,
        [userId]
    );

    return {
        ...user,
        roles: {
            global: roleRows.map((row) => ({
                id: row.id,
                name: row.name,
                scopes: filterScopesByDomain(row.scopes, "global"),
            })),
            class: [],
        },
    };
}

// Pool helpers

/**
 * Create a digipog pool.
 * @param {Object} poolData - Pool data.
 * @param {string} poolData.name - Pool name.
 * @param {string} [poolData.description] - Pool description.
 * @param {number} poolData.defaultShareholderId - Owner user ID.
 * @returns {Promise<number>}
 */
async function createPool({ name, description = "", defaultShareholderId }) {
    const shareItemId = await registerItem({
        name: `${name} Share`,
        description: `Share of ${name}`,
        stackSize: SHARES_PER_POOL,
        iconUrl: null,
    });
    const poolId = await dbRun("INSERT INTO digipog_pools (name, description, amount, share_item) VALUES (?, ?, ?, ?)", [name, description, 0, shareItemId]);
    await addItemToInventory(defaultShareholderId, shareItemId, SHARES_PER_POOL);
    return poolId;
}

/**
 * Delete a digipog pool.
 * @param {number} poolId - poolId.
 * @returns {Promise<void>}
 */
async function deletePool(poolId) {
    let row = await dbGet("SELECT share_item FROM digipog_pools WHERE id = ?", [poolId])
    await dbRun("DELETE FROM inventory WHERE item_id = ?", [row.share_item])
    await dbRun("DELETE FROM digipog_pools WHERE id = ?", [poolId]);
}

/**
 * Get pools a user owns shares for.
 * @param {number} userId - userId.
 * @returns {Promise<number[]>}
 */
async function getPoolsForUser(userId) {
    const allItems = await dbGetAll("SELECT item_id FROM inventory WHERE user_id = ?", [userId]);

    // For some reason, stacks are represented by multiple rows in the database
    // Turn into to Set to filter for uniqueness 
    const itemIds = new Set(allItems.map((item) => item.item_id));

    let pools = [];
    for (let item of itemIds) {
        const pool = await dbGet("SELECT id AS pool_id FROM digipog_pools WHERE share_item = ?", [item]);
        if (pool) pools.push(pool);
    }

    return [...pools]
}

/**
 * Get a digipog pool by ID.
 * @param {number} poolId - poolId.
 * @returns {Promise<Object|null>}
 */
async function getPoolById(poolId) {
    return dbGet("SELECT * FROM digipog_pools WHERE id = ?", [poolId]);
}

/**
 * Get pools joined by a user with pagination.
 * @param {number} userId - userId.
 * @param {number} limit - limit.
 * @param {number} offset - offset.
 * @returns {Promise<Object[]>}
 */
async function getPoolsForUserPaginated(userId, limit = 20, offset = 0) {
    const og = await getPoolsForUser(userId)

    const pools = og.slice(offset, offset + limit)

    return {
        pools: pools,
        total: og.length
    };
}

/**
 * Get members of a pool.
 * @param {number} poolId - poolId.
 * @returns {Promise<Object[]>}
 */
async function getUsersForPool(poolId) {
    const row = await dbGet("SELECT share_item FROM digipog_pools WHERE id = ?", [poolId]);
    if (row == null) return [];
    const users = await dbGetAll("SELECT user_id FROM inventory WHERE item_id = ?", [row.share_item]);
    let set = new Set(users);
    return [...set];
}

/**
 * Check whether a user belongs to a pool.
 * @param {number} userId - userId.
 * @param {number} poolId - poolId.
 * @returns {Promise<boolean>}
 */
async function isUserInPool(userId, poolId) {
    const row = await dbGet("SELECT share_item FROM digipog_pools WHERE id = ?", [poolId]);
    if (row == null) return false;

    const users = await dbGetAll("SELECT user_id FROM inventory WHERE item_id = ?", [row.share_item]);
    for (const user of users) {
        if (user.user_id === userId) return true;
    }
    return false;
}

/**
 * Checks whether a specific user is a top shareholder of the pool
 * @param {number} poolId - The pool to check.
 * @param {number} userId - The user to check.
 * @returns {Promise<boolean>} True if the user is a top shareholder of the pool.
 */
async function isPoolUserTopHolder(poolId, userId) {
    const row = await dbGet("SELECT share_item FROM digipog_pools WHERE id=?", [poolId]);

    const shareholders = await dbGetAll("SELECT user_id, quantity FROM inventory WHERE item_id=? ORDER BY quantity DESC", [row.share_item]);
    const maxQuantity = shareholders[0]?.quantity ?? 0;

    for (const shareholder of shareholders) {
        if (shareholder.quantity < maxQuantity) break;
        if (shareholder.user_id === userId) return true;
    }

    return false;
}

/**
 * Middleware-compatible founder check for pools.
 * @param {Object} req - Express request object
 * @returns {Promise<boolean>} Whether the requesting user founded the pool
 */
function poolTopHolderCheck(req) {
    return isPoolUserTopHolder(Number(req.params.id), req.user.id);
}


/**
 * Get the IDs of pools where the user is a top holder.
 * @param {number} userId - The user to check.
 * @returns {Promise<Array<number>>} Pool IDs where the user is a top holder.
 */
async function getTopHoldingPoolsForUser(userId) {
    const pools = await getPoolsForUser(userId);

    let topHoldingPools = [];
    for (const { pool_id } of pools) {
        if (await isPoolUserTopHolder(pool_id, userId))
            topHoldingPools.push(pool_id);
    }

    return topHoldingPools;
}

/**
 * Update a pool PIN after verifying the old PIN.
 * @param {number} poolId - poolId.
 * @param {string} oldPin - oldPin.
 * @param {string} newPin - newPin.
 * @returns {Promise<void>}
 */
async function updatePoolPin(poolId, oldPin, newPin) {
    const pool = await getPoolById(poolId);
    if (!pool) {
        throw new NotFoundError("pool not found.", {
            event: "pool.pin.update.failed",
            reason: "pool_not_found",
        });
    }

    // If pool already has a PIN, verify the old one matches
    if (pool.pin) {
        if (oldPin == null) {
            const ValidationError = require("@errors/validation-error");
            throw new ValidationError("Missing the current PIN", {
                event: "pool.pin.update.failed",
                reason: "missing_old_pin",
            });
        }
        const oldPinMatches = await compareBcrypt(String(oldPin), pool.pin);
        if (!oldPinMatches) {
            const AuthError = require("@errors/auth-error");
            throw new AuthError("Current PIN is incorrect.", {
                event: "pool.pin.update.failed",
                reason: "incorrect_old_pin",
            });
        }
    }

    const hashedPin = await hashBcrypt(String(newPin));
    await dbRun("UPDATE digipog_pools SET pin = ? WHERE id = ?", [hashedPin, poolId]);
}

/**
 * Verify a user PIN.
 * @param {number} poolId - poolId.
 * @param {string} pin - pin.
 * @returns {Promise<boolean>}
 */
async function verifyPoolPin(poolId, pin) {
    const pool = await getPoolById(poolId);
    if (!pool) {
        throw new NotFoundError("pool not found.", {
            event: "pool.pin.verify.failed",
            reason: "pool_not_found",
        });
    }

    if (!pool.pin) {
        throw new AppError("No PIN is set for this account. Please create one first.", {
            statusCode: 400,
            event: "user.pin.verify.failed",
            reason: "pin_not_set",
        });
    }

    const pinMatches = await compareBcrypt(String(pin), pool.pin);
    if (!pinMatches) {
        const AuthError = require("@errors/auth-error");
        throw new AuthError("PIN is incorrect.", {
            event: "pool.pin.verify.failed",
            reason: "incorrect_pin",
        });
    }

    return true;
}

/**
 * Remove a user from a pool.
 * @param {number} poolId - poolId.
 * @param {number} userId - userId.
 * @returns {Promise<void>} 
 */
async function removeUserFromPool(poolId, userId) {
    const { shareItem } = await dbGet("SELECT share_item AS shareItem FROM digipog_pools WHERE id = ?", [poolId]);
    if (await isPoolUserTopHolder(poolId, userId)) {
        const otherShareHolders = await dbGetAll("SELECT * FROM inventory WHERE item_id = ? AND user_id != ?", [shareItem, userId]);
        if (otherShareHolders.length === 0) {
            await dbRun("DELETE FROM digipog_pools WHERE id = ?", [poolId]);
            await dbRun("DELETE FROM inventory WHERE item_id = ?", [shareItem]);
            return;
        }
    }
    const { userShares } = await dbGet("SELECT SUM(quantity) AS userShares FROM inventory WHERE item_id = ? AND user_id = ?", [shareItem, userId]);
    if (userShares != null) await removeItemFromInventory(userId, shareItem, userShares);
}

/**
 * Pay out and clear a pool.
 * @param {Object} payoutData - Payout data.
 * @param {number} payoutData.actingUserId - Acting user ID.
 * @param {number} payoutData.poolId - Pool ID.
 * @param {number} payoutData.amount - Percentage or set amount.
 * @param {number} payoutData.payoutType - Determines whether amount is percent/digipogs
 * @returns {Promise<Object>}
 */
async function payoutPool({ actingUserId, poolId, amount, payoutType }) {
    if (!Number.isInteger(poolId) || poolId < 0) {
        return { success: false, message: "Invalid pool ID." };
    }

    const pool = await getPoolById(poolId);
    if (!pool) {
        return { success: false, message: "Pool not found." };
    }

    const isFounder = await isPoolUserTopHolder(poolId, actingUserId);
    if (!isFounder) {
        return { success: false, message: "You do not own this pool." };
    }

    if (amount <= 0) {
        return { success: false, message: "Cannot payout 0 pogs." }
    }

    if (payoutType !== "percent" && payoutType !== "digipogs") {
        return { success: false, message: `Payout type must be "percent" or "digipogs".` }
    }

    if (amount > 100 && payoutType === "percent") {
        return { success: false, message: "Cannot payout more than 100% of the pool." }
    }

    if (amount > pool.amount && payoutType === "digipogs") {
        return { success: false, message: "Cannot payout more than the pool\'s amount." }
    }

    const payoutAmount = (payoutType === "percent" ? pool.amount * (amount / 100) : amount);
    const shareholders = await dbGetAll("SELECT * FROM inventory WHERE item_id = ?", [pool.share_item]);
    const { totalShares } = await dbGet("SELECT SUM(quantity) AS totalShares FROM inventory WHERE item_id = ?", [pool.share_item]);

    // Payout each member
    try {
        await dbRun("BEGIN TRANSACTION");
        for (const shareholder of shareholders) {
            const userShare = await dbGet("SELECT quantity FROM inventory WHERE item_id = ? AND user_id = ?", [pool.share_item, shareholder.user_id]);
            const userPayout = Math.floor(payoutAmount * (userShare.quantity / totalShares));
            if (!userShare) continue;

            await dbRun("UPDATE users SET digipogs = digipogs + ? WHERE id = ?", [userPayout, shareholder.user_id])
            await dbRun("INSERT INTO exchanges (from_user_id, from_id, from_type, offer, to_user_id, to_type, request, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
                actingUserId,
                pool.id,
                "pool",
                JSON.stringify({ 0: userPayout }),
                shareholder.user_id,
                "user",
                JSON.stringify({}),
                "Pool Payout",
                "completed",
                Date.now(),
                Date.now(),
            ]);
        }

        await dbRun("UPDATE digipog_pools SET amount = amount - ? WHERE id = ?", [Math.floor(payoutAmount), poolId]);
        await dbRun("COMMIT");
    } catch (err) {
        await dbRun("ROLLBACK");
        throw err;
        throw new AppError("An error occurred while processing the pool payout.", { event: "digipog_pool_payout_error", error: err.message });
    }

    return { success: true, message: "Pool payout successful." };
}

// Transactions

/**
 * Get all transactions for a user.
 * @param {number} userId - userId.
 * @returns {Promise<Object[]>}
 */
async function getUserTransactions(userId) {
    let transactions = await dbGetAll(
        "SELECT * FROM exchanges WHERE request = '{}' AND ((from_user_id = ? AND from_type = 'user') OR (to_user_id = ? AND to_type = 'user')) ORDER BY created_at DESC",
        [userId, userId]
    );
    // Filter only for transactions.
    transactions = transactions.filter((transaction) => {
        const keys = Object.keys(JSON.parse(transaction.offer));
        return keys.length === 1 && keys.includes("0");
    });
    return enrichTransactions(transactions);
}

/**
 * Get user transactions with pagination.
 * @param {number} userId - userId.
 * @param {number} limit - limit.
 * @param {number} offset - offset.
 * @returns {Promise<Object[]>}
 */
async function getUserTransactionsPaginated(userId, limit = 25, offset = 0) {
    let whereQuery = "WHERE request = '{}' AND ((from_user_id = ? AND from_type = 'user') OR (to_user_id = ? AND to_type = 'user'))";
    const params = [userId, userId];

    const totalRow = await dbGet(`SELECT COUNT(*) AS count FROM exchanges ${whereQuery}`, params);
    let transactions = await dbGetAll(`SELECT * FROM exchanges ${whereQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    // Filter only for transactions.
    transactions = transactions.filter((transaction) => {
        const keys = Object.keys(JSON.parse(transaction.offer));
        return keys.length === 1 && keys.includes("0");
    });
    const enrichedTransactions = await enrichTransactions(transactions);

    return {
        transactions: enrichedTransactions,
        total: totalRow.count,
    };
}

/**
 * Add display data to transaction rows.
 * @param {Array} transactions - transactions.
 * @returns {Promise<Object[]>}
 */
async function enrichTransactions(transactions) {
    if (!transactions || transactions.length === 0) {
        return [];
    }

    const userIds = new Set();
    const poolIds = new Set();
    const classIds = new Set();

    for (const transaction of transactions) {
        if (transaction.from_user_id != null) {
            if (transaction.from_type === "user" || transaction.from_type === "award") {
                userIds.add(transaction.from_user_id);
            } else if (transaction.from_type === "pool") {
                poolIds.add(transaction.from_id);
            } else if (transaction.from_type === "class") {
                classIds.add(transaction.from_id);
            }
        }

        if (transaction.to_user_id != null) {
            if (transaction.to_type === "user" || transaction.to_type === "award") {
                userIds.add(transaction.to_user_id);
            } else if (transaction.to_type === "pool") {
                poolIds.add(transaction.to_id);
            } else if (transaction.to_type === "class") {
                classIds.add(transaction.to_id);
            }
        }
    }

    const [users, pools, classes] = await Promise.all([
        fetchUsersByIds(Array.from(userIds)),
        fetchPoolsByIds(Array.from(poolIds)),
        fetchClassesByIds(Array.from(classIds)),
    ]);

    return transactions.map((transaction) => ({
        amount: JSON.parse(transaction.offer)[0],
        reason: transaction.reason,
        date: transaction.date,
        from: buildTransactionParty(transaction.from_user_id, transaction.from_id, transaction.from_type, users, pools, classes),
        to: buildTransactionParty(transaction.to_user_id, transaction.to_id, transaction.to_type, users, pools, classes),
    }));
}

/**
 * Fetch users and index them by ID.
 * @param {number[]} userIds - userIds.
 * @returns {Promise<Map<number, Object>>}
 */
async function fetchUsersByIds(userIds) {
    if (userIds.length === 0) return new Map();

    const placeholders = userIds.map(() => "?").join(",");
    const users = await dbGetAll(`SELECT id, displayName, email FROM users WHERE id IN (${placeholders})`, userIds);

    const userMap = new Map();
    for (const user of users) {
        userMap.set(user.id, {
            id: user.id,
            username: user.displayName || user.email || "Unknown User",
        });
    }
    return userMap;
}

/**
 * Fetch pools and index them by ID.
 * @param {number[]} poolIds - poolIds.
 * @returns {Promise<Map<number, Object>>}
 */
async function fetchPoolsByIds(poolIds) {
    if (poolIds.length === 0) return new Map();

    const placeholders = poolIds.map(() => "?").join(",");
    const pools = await dbGetAll(`SELECT id, name FROM digipog_pools WHERE id IN (${placeholders})`, poolIds);

    const poolMap = new Map();
    for (const pool of pools) {
        poolMap.set(pool.id, {
            id: pool.id,
            username: pool.name || "Unknown Pool",
        });
    }
    return poolMap;
}

/**
 * Fetch classes and index them by ID.
 * @param {number[]} classIds - classIds.
 * @returns {Promise<Map<number, Object>>}
 */
async function fetchClassesByIds(classIds) {
    if (classIds.length === 0) return new Map();

    const placeholders = classIds.map(() => "?").join(",");
    const classes = await dbGetAll(`SELECT id, name FROM classroom WHERE id IN (${placeholders})`, classIds);

    const classMap = new Map();
    for (const classInfo of classes) {
        classMap.set(classInfo.id, {
            id: classInfo.id,
            username: classInfo.name || "Unknown Class",
        });
    }
    return classMap;
}

/**
 * Build the display object for a transaction party.
 * @param {number} id - id.
 * @param {string} type - type.
 * @param {Object} users - users.
 * @param {Object} pools - pools.
 * @param {Object} classes - classes.
 * @returns {Object|null}
 */
function buildTransactionParty(userId, typedId, type, users, pools, classes) {
    const normalizedType = type || "unknown";
    let username = null;
    let id = null;

    if (normalizedType === "user" || normalizedType === "award") {
        username = users.get(userId)?.username || "Unknown User";
        id = userId;
    } else if (normalizedType === "pool") {
        username = pools.get(typedId)?.username || "Unknown Pool";
        id = typedId;
    } else if (normalizedType === "class") {
        username = classes.get(typedId)?.username || "Unknown Class";
        id = typedId;
    }
    return {
        id,
        type: normalizedType,
        username,
    };
}

// Award / Transfer

const AWARD_RECIPIENT_TYPES = new Set(["user", "pool", "class"]);

/**
 * Normalize award recipient fields.
 * @param {Object} awardData - awardData.
 * @returns {Object}
 */
function normalizeAwardRecipient(awardData) {
    let to = awardData?.to;
    let deprecatedFormatUsed = false;

    if (typeof to === "string" || typeof to === "number") {
        to = { id: to, type: "user" };
        deprecatedFormatUsed = true;
    } else if (!to && (awardData?.userId || awardData?.studentId)) {
        to = { id: awardData.userId || awardData.studentId, type: "user" };
        deprecatedFormatUsed = true;
    }

    if (!to || typeof to !== "object") {
        return { error: "Missing recipient identifier." };
    }

    const normalizedRecipient = { ...to };
    if (!normalizedRecipient.id && (normalizedRecipient.userId || normalizedRecipient.studentId)) {
        normalizedRecipient.id = normalizedRecipient.userId || normalizedRecipient.studentId;
        if (!normalizedRecipient.type) {
            normalizedRecipient.type = "user";
        }
        deprecatedFormatUsed = true;
    }

    if (!normalizedRecipient.type) {
        normalizedRecipient.type = "user";
        deprecatedFormatUsed = true;
    }

    return { to: normalizedRecipient, deprecatedFormatUsed };
}

/**
 * Validate a digipog award request.
 * @param {Object} awardData - Award data.
 * @param {Object} awardData.from - Sender data.
 * @param {Object} awardData.to - Recipient data.
 * @param {number} awardData.amount - Amount to award.
 * @returns {void}
 */
function validateAwardRequest({ from, to, amount }) {
    if (!from || !Number.isFinite(amount)) {
        return "Missing required fields.";
    }

    if (!AWARD_RECIPIENT_TYPES.has(to.type)) {
        return "Invalid recipient type.";
    }

    if (to.type !== "class" && !to.id) {
        return "Missing recipient identifier.";
    }

    return null;
}

/**
 * Check whether a sender may use an award to revoke digipogs.
 * @param {number} amount - Award amount.
 * @param {number} senderPermissionLevel - Sender permission level.
 * @returns {string|null}
 */
function validateAwardAmount(amount, senderPermissionLevel) {
    if (amount === 0) {
        return "Amount must be greater than zero.";
    }

    if (amount < 0 && senderPermissionLevel < TEACHER_PERMISSIONS) {
        return "Only teachers and managers can revoke digipogs.";
    }

    return null;
}

/**
 * Check whether class scopes allow awarding digipogs.
 * @param {string} scopes - scopes.
 * @returns {boolean}
 */
function hasClassDigipogAwardAuthority(scopes) {
    return scopes.includes(SCOPES.CLASS.SYSTEM.ADMIN) || scopes.includes(SCOPES.CLASS.DIGIPOGS.AWARD);
}

/**
 * Check whether a user can award digipogs in a class.
 * @param {number} userId - userId.
 * @param {number} classId - classId.
 * @param {number} ownerId - ownerId.
 * @returns {Promise<boolean>}
 */
async function userCanAwardDigipogsInClass(userId, classId, ownerId) {
    if (ownerId === userId) {
        return true;
    }

    const roleRows = await dbGetAll(
        `SELECT r.scopes FROM user_roles ur
         JOIN roles r ON ur.roleId = r.id
         WHERE ur.userId = ? AND ur.classId = ?`,
        [userId, classId]
    );

    return hasClassDigipogAwardAuthority(roleRows.flatMap((row) => parseScopesField(row.scopes)));
}

/**
 * Get class IDs where a user can award digipogs.
 * @param {number} userId - userId.
 * @returns {Promise<number[]>}
 */
async function getAwardableClassIdsForUser(userId) {
    const senderRoleRows = await dbGetAll(
        `SELECT ur.classId, r.scopes
         FROM user_roles ur
         JOIN roles r ON ur.roleId = r.id
         WHERE ur.userId = ? AND ur.classId IS NOT NULL`,
        [userId]
    );

    const senderClassScopes = new Map();
    for (const row of senderRoleRows) {
        const scopes = parseScopesField(row.scopes);
        const existingScopes = senderClassScopes.get(row.classId) || [];
        senderClassScopes.set(row.classId, existingScopes.concat(scopes));
    }

    return [...senderClassScopes.entries()].filter(([, scopes]) => hasClassDigipogAwardAuthority(scopes)).map(([classId]) => classId);
}

/**
 * Check whether a user belongs to any listed class.
 * @param {number} userId - userId.
 * @param {number[]} classIds - classIds.
 * @returns {Promise<boolean>}
 */
async function userIsInAnyClass(userId, classIds) {
    if (classIds.length === 0) {
        return false;
    }

    const placeholders = classIds.map(() => "?").join(",");
    const row = await dbGet(`SELECT 1 FROM classusers WHERE studentId = ? AND classId IN (${placeholders}) LIMIT 1`, [userId, ...classIds]);
    return Boolean(row);
}

/**
 * Check whether a user is in a class owned by another user.
 * @param {number} userId - userId.
 * @param {number} ownerId - ownerId.
 * @returns {Promise<boolean>}
 */
async function userIsInClassOwnedByUser(userId, ownerId) {
    const row = await dbGet(
        `SELECT 1 FROM classusers cu1
         INNER JOIN classroom c ON c.id = cu1.classId
         WHERE cu1.studentId = ?
         AND c.owner = ?
         LIMIT 1`,
        [userId, ownerId]
    );

    return Boolean(row);
}

/**
 * Check whether class authority allows awarding a user.
 * @param {Object} senderId - senderId.
 * @param {Object} recipientId - recipientId.
 * @returns {Promise<boolean>}
 */
async function canAwardUserByClassAuthority(senderId, recipientId) {
    const awardableClassIds = await getAwardableClassIdsForUser(senderId);
    if (await userIsInAnyClass(recipientId, awardableClassIds)) {
        return true;
    }

    return userIsInClassOwnedByUser(recipientId, senderId);
}

/**
 * Award digipogs to eligible users in a class.
 * @param {Object} awardData - Award data.
 * @param {Object} awardData.from - Sender data.
 * @param {Object} awardData.to - Recipient class data.
 * @param {number} awardData.amount - Amount to award.
 * @param {number} awardData.senderPermissionLevel - Sender permission level.
 * @param {Function} awardData.fail - Failure helper.
 * @returns {Promise<Object>}
 */
async function awardDigipogsToClass({ from, to, amount, senderPermissionLevel, fail }) {
    if (to.code) {
        to.id = await getClassIDFromCode(to.code);
        if (!to.id) {
            return fail("Invalid class code.");
        }
    } else if (!to.id) {
        return fail("Missing class identifier.");
    }

    const classInfo = await dbGet("SELECT c.id, c.owner FROM classroom c WHERE c.id = ?", [to.id]);
    if (!classInfo) {
        return fail("Recipient class not found.");
    }

    const canAwardTargetClass = await userCanAwardDigipogsInClass(from, to.id, classInfo.owner);
    if (!canAwardTargetClass && senderPermissionLevel < TEACHER_PERMISSIONS) {
        return fail("Sender does not have permission to award to this class.");
    }

    await dbRun("UPDATE users SET digipogs = digipogs + ? WHERE id IN (SELECT studentId FROM classusers WHERE classId = ?) OR id = ?", [
        amount,
        to.id,
        classInfo.owner,
    ]);

    return null;
}

/**
 * Award digipogs to members of a pool.
 * @param {Object} awardData - Award data.
 * @param {Object} awardData.to - Recipient pool data.
 * @param {number} awardData.amount - Amount to award.
 * @param {number} awardData.senderPermissionLevel - Sender permission level.
 * @param {Function} awardData.fail - Failure helper.
 * @returns {Promise<Object>}
 */
async function awardDigipogsToPool({ to, amount, senderPermissionLevel, fail }) {
    if (!to.id) {
        return fail("Missing pool identifier.");
    }

    if (senderPermissionLevel < TEACHER_PERMISSIONS) {
        return fail("Sender does not have permission to award to pools.");
    }

    const poolInfo = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [to.id]);
    if (!poolInfo) {
        return fail("Recipient pool not found.");
    }

    await dbRun("UPDATE digipog_pools SET amount = amount + ? WHERE id = ?", [amount, to.id]);

    return null;
}

/**
 * Award digipogs to one user.
 * @param {Object} awardData - Award data.
 * @param {Object} awardData.from - Sender data.
 * @param {Object} awardData.to - Recipient user data.
 * @param {number} awardData.amount - Amount to award.
 * @param {number} awardData.senderPermissionLevel - Sender permission level.
 * @param {Function} awardData.fail - Failure helper.
 * @returns {Promise<Object>}
 */
async function awardDigipogsToUser({ from, to, amount, senderPermissionLevel, fail }) {
    const toUser = await dbGet("SELECT id FROM users WHERE id = ?", [to.id]);
    if (!toUser) {
        return fail("Recipient account not found.");
    }

    if (senderPermissionLevel < TEACHER_PERMISSIONS) {
        const hasPermission = await canAwardUserByClassAuthority(from, to.id);
        if (!hasPermission) {
            return fail("Sender does not have permission to award to this user.");
        }
    }

    await dbRun("UPDATE users SET digipogs = digipogs + ? WHERE id = ?", [amount, to.id]);

    return null;
}

/**
 * Apply a normalized digipog award.
 * @param {Object} awardData - Award data.
 * @param {Object} awardData.from - Sender data.
 * @param {Object} awardData.to - Recipient data.
 * @param {number} awardData.amount - Amount to award.
 * @param {number} awardData.senderPermissionLevel - Sender permission level.
 * @param {Function} awardData.fail - Failure helper.
 * @returns {Promise<Object>}
 */
async function applyAwardDigipogs({ from, to, amount, senderPermissionLevel, fail }) {
    if (to.type === "class") {
        return awardDigipogsToClass({ from, to, amount, senderPermissionLevel, fail });
    }

    if (to.type === "pool") {
        return awardDigipogsToPool({ to, amount, senderPermissionLevel, fail });
    }

    return awardDigipogsToUser({ from, to, amount, senderPermissionLevel, fail });
}

/**
 * Build the success message for an award response.
 * @param {boolean} deprecatedFormatUsed - deprecatedFormatUsed.
 * @returns {string}
 */
function buildAwardSuccessMessage(deprecatedFormatUsed) {
    return deprecatedFormatUsed
        ? "Digipogs awarded successfully. Warning: Deprecated award format used. See documentation for updated usage."
        : "Digipogs awarded successfully.";
}

/**
 * Validate and apply a digipog award.
 * @param {Object} awardData - awardData.
 * @param {Object} user - user.
 * @returns {Promise<Object>}
 */
async function awardDigipogs(awardData, user) {
    try {
        const from = user?.userId ?? user?.id;
        const amount = Math.ceil(Number(awardData?.amount));
        const reason = awardData?.reason || "Awarded";

        const normalizedRecipient = normalizeAwardRecipient(awardData);
        if (normalizedRecipient.error) {
            return { success: false, message: normalizedRecipient.error };
        }

        const { to, deprecatedFormatUsed } = normalizedRecipient;
        const validationError = validateAwardRequest({ from, to, amount });
        if (validationError) {
            return { success: false, message: validationError };
        }

        const accountId = `award-${from}`;
        /**
         * Build a failed award response and record the attempt.
         * @param {string} message - Failure message.
         * @returns {{success: boolean, message: string}}
         */
        const fail = (message) => {
            recordAttempt(accountId, false);
            return { success: false, message };
        };

        const rateLimitCheck = checkRateLimit(accountId);
        if (!rateLimitCheck.allowed) {
            return { success: false, message: rateLimitCheck.message, rateLimited: true, waitTime: rateLimitCheck.waitTime };
        }

        const fromUser = await getComputedGlobalUser(from);
        if (!fromUser || !fromUser.email) {
            return fail("Sender account not found.");
        }
        const senderPermissionLevel = getGlobalPermissionLevelForUser(fromUser);

        const amountError = validateAwardAmount(amount, senderPermissionLevel);
        if (amountError) {
            return fail(amountError);
        }

        const awardFailure = await applyAwardDigipogs({ from, to, amount, senderPermissionLevel, fail });
        if (awardFailure) {
            return awardFailure;
        }

        try {
            await dbRun("INSERT INTO exchanges (from_user_id, from_type, offer, to_user_id, to_type, request, reason, status, created_at, updated_at) VALUES (?, 'user', ?, ?, ?, '{}', ?, 'completed', ?, ?)", [
                from,
                JSON.stringify({ 0: amount }),
                to.id,
                to.type,
                reason,
                new Date().toISOString(),
                new Date().toISOString()
            ]);
        } catch (err) {
            return { success: true, message: "Award succeeded, but failed to log transaction." };
        }

        recordAttempt(accountId, true);
        return {
            success: true,
            message: buildAwardSuccessMessage(deprecatedFormatUsed),
        };
    } catch (err) {
        return { success: false, message: "Database error." };
    }
}

/**
 * Calculate the standard digipog transfer tax.
 * @param {number} amount - Gross transfer amount.
 * @returns {{taxedAmount: number, taxAmount: number}}
 */
function calculateDigipogTransferTax(amount) {
    if (amount < 0) {
        return {
            taxedAmount: amount,
            taxAmount: 0,
        };
    }

    const taxedAmount = Math.floor(amount * 0.9) > 1 ? Math.floor(amount * 0.9) : 1;
    return {
        taxedAmount,
        taxAmount: amount - taxedAmount,
    };
}

/**
 * Credit a digipog transfer recipient and route tax to the developer pool when present.
 * @param {number} amount - Gross transfer amount.
 * @param {"user"|"pool"} recipientType - Recipient account type.
 * @param {number} recipientId - Recipient account ID.
 * @returns {Promise<number>} Tax amount deducted.
 */
async function creditDigipogTransferRecipient(amount, recipientType, recipientId) {
    const { taxedAmount, taxAmount } = calculateDigipogTransferTax(amount);

    if (recipientType === "user") {
        await dbRun("UPDATE users SET digipogs = digipogs + ? WHERE id = ?", [taxedAmount, recipientId]);
    } else {
        await dbRun("UPDATE digipog_pools SET amount = amount + ? WHERE id = ?", [taxedAmount, recipientId]);
    }

    const devPool = await dbGet("SELECT id FROM digipog_pools WHERE id = ?", [0]);
    if (devPool) {
        await dbRun("UPDATE digipog_pools SET amount = amount + ? WHERE id = ?", [taxAmount, 0]);
    }

    return taxAmount;
}

/**
 * Transfer digipogs between two users.
 * @param {Object} transferData - transferData.
 * @param {Object} [options] - Trusted server-side options.
 * @returns {Promise<Object>}
 */
async function transferDigipogs(transferData, options = {}) {
    try {
        const { pin, reason = "", pool } = transferData;
        const pinVerified = options.pinVerified === true;
        let from = transferData.from;
        let to = transferData.to;
        const amount = Math.floor(transferData.amount);

        let deprecatedFormatUsed = false;
        if (typeof from === "string" || typeof from === "number") {
            // Old API: `from`/`to` were plain user IDs; `pool` flag indicated a pool recipient
            if (typeof to !== "string" && typeof to !== "number") {
                return { success: false, message: "Missing recipient identifier." };
            }
            from = { id: from, type: "user" };
            to = { id: pool ? pool : to, type: pool ? "pool" : "user" };
            deprecatedFormatUsed = true;
        } else if (!from || !from.id) {
            return { success: false, message: "Missing sender identifier." };
        }
        if (!from.type) from.type = "user";
        // Normalize `to` independently: if it's still a primitive at this point
        // (e.g. the caller passed an object `from` but a raw id for `to`), wrap it
        // rather than letting `to.type` throw on a non-object.
        if (typeof to === "string" || typeof to === "number") {
            to = { id: to, type: pool ? "pool" : "user" };
        } else if (!to || typeof to !== "object") {
            return { success: false, message: "Missing recipient identifier." };
        }
        if (!to.type) to.type = "user";

        if (
            !from ||
            from.id === undefined ||
            !to ||
            to.id === undefined ||
            amount === undefined ||
            amount === null ||
            Number.isNaN(amount) ||
            reason === undefined ||
            (!pin && !pinVerified)
        ) {
            return { success: false, message: "Missing required fields." };
        } else if (amount === 0) {
            return { success: false, message: "Amount must be greater than zero." };
        } else if (amount < 0) {
            const sender = from.type === "user" ? await getComputedGlobalUser(from.id) : null;
            const senderPermissionLevel = sender ? getGlobalPermissionLevelForUser(sender) : 0;
            if (senderPermissionLevel < TEACHER_PERMISSIONS) {
                return { success: false, message: "Amount must be greater than zero." };
            }
        } else if (from.type === to.type && from.id === to.id) {
            return { success: false, message: "Cannot transfer to the same account." };
        } else if ((from.type !== "user" && from.type !== "pool") || (to.type !== "user" && to.type !== "pool")) {
            return { success: false, message: "Invalid sender or recipient type." };
        }

        const accountId = `${from.type}-${from.id}`;
        const rateLimitCheck = checkRateLimit(accountId);
        if (!rateLimitCheck.allowed) {
            return { success: false, message: rateLimitCheck.message, rateLimited: true, waitTime: rateLimitCheck.waitTime };
        }

        let fromAccount;
        if (from.type === "user") {
            fromAccount = await dbGet("SELECT id AS userId, digipogs, pin FROM users WHERE id = ?", [from.id]);
            if (fromAccount == null) {
                recordAttempt(accountId, false);
                return { success: false, message: "Sender account not found." };
            }
        } else {
            fromAccount = await dbGet("SELECT id, amount, pin FROM digipog_pools WHERE id = ?", [from.id]);
            if (fromAccount == null) {
                recordAttempt(accountId, false);
                return { success: false, message: "Sender pool not found." };
            }
        }

        if (!pinVerified && !fromAccount.pin) {
            recordAttempt(accountId, false);
            return { success: false, message: "Account PIN not configured." };
        }

        if (!pinVerified) {
            const isPinValid = await compareBcrypt(String(pin), fromAccount.pin);
            if (!isPinValid) {
                recordAttempt(accountId, false);
                return { success: false, message: "Invalid PIN." };
            }
        }

        const fromBalance = from.type === "user" ? fromAccount.digipogs : fromAccount.amount;
        if (fromBalance < amount) {
            recordAttempt(accountId, false);
            return { success: false, message: "Insufficient funds." };
        }

        let toAccount;
        if (to.type === "user") {
            toAccount = await dbGet("SELECT id AS userId FROM users WHERE id = ?", [to.id]);

            if (toAccount == null) {
                recordAttempt(accountId, false);
                return { success: false, message: "Recipient account not found." };
            }
        } else {
            toAccount = await dbGet("SELECT id FROM digipog_pools WHERE id = ?", [to.id]);

            if (toAccount == null) {
                recordAttempt(accountId, false);
                return { success: false, message: "Recipient pool not found." };
            }

            // return founder if no share item
            const row = await dbGet("SELECT share_item FROM digipog_pools WHERE id = ?", [toAccount.id]);
            if (row.share_item == null) {
                const { userId } = await dbGet("SELECT user_id AS userId FROM digipog_pool_users WHERE pool_id = ? AND owner = 1", [toAccount.id]);
                toAccount.userId = userId;
            } else {
                const { userId } = await dbGet("SELECT user_id AS userId FROM inventory WHERE item_id = ? ORDER BY quantity DESC", [row.share_item]);
                toAccount.userId = userId;
            }
        }

        try {
            await dbRun("BEGIN IMMEDIATE TRANSACTION");
            if (amount < 0) {
                const requiredBalance = Math.abs(amount);
                const recipientUpdated =
                    to.type === "user"
                        ? await dbRunChanges("UPDATE users SET digipogs = digipogs + ? WHERE id = ? AND digipogs >= ?", [
                            amount,
                            to.id,
                            requiredBalance,
                        ])
                        : await dbRunChanges("UPDATE digipog_pools SET amount = amount + ? WHERE id = ? AND amount >= ?", [
                            amount,
                            to.id,
                            requiredBalance,
                        ]);

                if (!recipientUpdated) {
                    throw new Error("Insufficient funds.");
                }
            } else if (from.type === "user") {
                const debited = await dbRunChanges("UPDATE users SET digipogs = digipogs - ? WHERE id = ? AND digipogs >= ?", [
                    amount,
                    from.id,
                    amount,
                ]);
                if (!debited) {
                    throw new Error("Insufficient funds.");
                }
            } else {
                const debited = await dbRunChanges("UPDATE digipog_pools SET amount = amount - ? WHERE id = ? AND amount >= ?", [
                    amount,
                    from.id,
                    amount,
                ]);
                if (!debited) {
                    throw new Error("Insufficient funds.");
                }
            }
            if (amount >= 0) {
                await creditDigipogTransferRecipient(amount, to.type, to.id);
            }
            await dbRun("COMMIT");
        } catch (err) {
            try {
                await dbRun("ROLLBACK");
            } catch (rollbackErr) { }
            recordAttempt(accountId, false);
            if (err && err.message === "Insufficient funds.") {
                return { success: false, message: "Insufficient funds." };
            }
            return { success: false, message: "Transfer failed due to database error." };
        }

        try {
            await dbRun("INSERT INTO exchanges (from_user_id, from_id, from_type, offer, to_user_id, to_id, to_type, request, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
                fromAccount.userId ?? from.userId,
                fromAccount.id,
                from.type,
                JSON.stringify({ 0: amount }),
                toAccount.userId,
                toAccount.id,
                to.type,
                JSON.stringify({}),
                transferData.reason,
                "completed",
                new Date().toISOString(),
                new Date().toISOString()
            ]);
        } catch (err) {
            throw err;
        }

        recordAttempt(accountId, true);
        return {
            success: true,
            message: `Transfer successful. This endpoint is deprecated. Check the docs for endpoints under the "Exchanges" category`,
        };
    } catch (err) {
        console.log(err);
        return { success: false, message: "Database error." };
    }
}

module.exports = {
    // Transactions
    getUserTransactions,
    getUserTransactionsPaginated,
    awardDigipogs,
    transferDigipogs,
    creditDigipogTransferRecipient,

    // Pool helpers
    createPool,
    deletePool,
    getPoolsForUser,
    getPoolsForUserPaginated,
    getUsersForPool,
    getPoolById,
    getTopHoldingPoolsForUser,
    isUserInPool,
    isPoolUserTopHolder,
    poolTopHolderCheck,
    updatePoolPin,
    verifyPoolPin,
    removeUserFromPool,
    payoutPool,
};
