const { dbGet, dbGetAll, dbRun } = require("@modules/database");
const { buildPagination } = require("@modules/pagination");
const { creditDigipogTransferRecipient, isPoolUserTopHolder } = require("@services/digipog-service");
const { addItemToInventory } = require("@services/inventory-service");
const { createNotification } = require("@services/notification-service");
const NotFoundError = require("@errors/not-found-error");
const ValidationError = require("@errors/validation-error");
const ForbiddenError = require("@errors/forbidden-error");
const request = require("@controllers/class/break/request");

/**
 * Aggregate duplicate item IDs in an items array and validate each entry.
 * @param {Array} items - Raw items array from request.
 * @returns {Array<{itemId: number, quantity: number}>}
 */
function normalizeItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new ValidationError("Items list must be a non-empty array.", { reason: "invalid_items" });
    }

    const aggregated = new Map();
    for (const entry of items) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new ValidationError("Each item must be an object with itemId and quantity.", { reason: "invalid_item_entry" });
        }

        const itemId = Number(entry.itemId);
        const quantity = Number(entry.quantity);

        if (!Number.isInteger(itemId) || itemId <= 0) {
            throw new ValidationError("Each item must have a positive integer itemId.", { reason: "invalid_item_id" });
        }
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new ValidationError("Each item must have a positive integer quantity.", { reason: "invalid_quantity" });
        }

        aggregated.set(itemId, (aggregated.get(itemId) || 0) + quantity);
    }

    return Array.from(aggregated.entries()).map(([itemId, quantity]) => ({ itemId, quantity }));
}

/**
 * Check that items exist in the registry.
 * @param {Array<{itemId: number}>} items - Normalized item list.
 * @returns {Promise<void>}
 */
async function checkItemsExistInRegistry(items) {
    const itemIds = items.map(({ itemId }) => itemId);
    const placeholders = itemIds.map(() => "?").join(",");
    const rows = await dbGetAll(`SELECT id FROM item_registry WHERE id IN (${placeholders})`, itemIds);
    if (rows.length !== itemIds.length) {
        throw new ValidationError(`One or more items do not exist in the registry.`, { reason: "item_not_found" });
    }
}

/**
 * Get total quantity a user holds of a single item across all inventory stacks.
 * @param {number} userId
 * @param {number} itemId
 * @returns {Promise<number>}
 */
async function getInventoryTotal(userId, itemId) {
    const row = await dbGet("SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory WHERE user_id = ? AND item_id = ?", [userId, itemId]);
    return row ? row.total : 0;
}

/**
 * Assert a user holds at least the required quantity of every item. Throws a
 * ValidationError if any item is insufficient.
 * @param {number} userId
 * @param {Array<{itemId: number, quantity: number}>} items
 * @returns {Promise<void>}
 */
async function checkInventoryAvailability(userId, items) {
    for (const { itemId, quantity } of items) {
        const total = await getInventoryTotal(userId, itemId);
        if (total < quantity) {
            throw new ValidationError(`Insufficient inventory for item ${itemId}: have ${total}, need ${quantity}.`, {
                reason: "insufficient_inventory",
                itemId,
            });
        }
    }
}

/**
 * Remove an exact quantity of an item from a user's inventory stacks. Throws
 * if the user does not hold enough. This is the strict variant used during
 * trade acceptance; it does NOT alter the permissive removeItemFromInventory
 * used elsewhere.
 * @param {number} userId
 * @param {number} itemId
 * @param {number} quantity
 * @returns {Promise<void>}
 */
async function strictRemoveFromInventory(userId, itemId, quantity) {
    const rows = await dbGetAll("SELECT id, quantity FROM inventory WHERE user_id = ? AND item_id = ? ORDER BY id DESC", [userId, itemId]);
    const total = rows.reduce((sum, r) => sum + r.quantity, 0);

    if (total < quantity) {
        throw new Error(`Insufficient inventory: need ${quantity} of item ${itemId}, have ${total}.`);
    }

    let remaining = quantity;
    for (const row of rows) {
        if (remaining <= 0) break;
        if (row.quantity <= remaining) {
            await dbRun("DELETE FROM inventory WHERE id = ?", [row.id]);
            remaining -= row.quantity;
        } else {
            await dbRun("UPDATE inventory SET quantity = quantity - ? WHERE id = ?", [remaining, row.id]);
            remaining = 0;
        }
    }
}

/**
 * Parse and validate one trade side.
 * @param {Object} side - Side object from request body (offered or requested).
 * @param {number} userId - The user who owns this side.
 * @param {"offered"|"requested"} label - Used in error messages.
 * @returns {Promise<{sourceType: string, poolId: number|null, items: Array|null, digipogs: number|null}>}
 */
async function validateSide(side, userId, label) {
    if (!side || typeof side !== "object") {
        throw new ValidationError(`The ${label} side is required.`, { reason: "missing_side" });
    }

    const source = side.source;
    if (!source || !source.type) {
        throw new ValidationError(`The ${label} side must specify a source type.`, { reason: "missing_source_type" });
    }

    if (source.type === "inventory") {
        if (side.digipogs !== undefined) {
            throw new ValidationError(`Inventory ${label} side cannot include digipogs.`, { reason: "inventory_side_no_digipogs" });
        }

        const items = normalizeItems(side.items);
        await checkItemsExistInRegistry(items);
        return { sourceType: "inventory", poolId: null, items, digipogs: null };
    }

    if (source.type === "pool") {
        if (side.items !== undefined) {
            throw new ValidationError(`Pool ${label} side cannot include items.`, { reason: "pool_side_no_items" });
        }

        const poolId = Number(source.poolId);
        if (!Number.isInteger(poolId) || poolId <= 0) {
            throw new ValidationError(`The ${label} side pool ID must be a positive integer.`, { reason: "invalid_pool_id" });
        }

        const digipogs = Number(side.digipogs);
        if (!Number.isInteger(digipogs) || digipogs <= 0) {
            throw new ValidationError(`The ${label} pool side must include a positive integer digipog amount.`, { reason: "invalid_digipogs" });
        }

        const poolExists = await dbGet("SELECT id FROM digipog_pools WHERE id = ?", [poolId]);
        if (!poolExists) {
            throw new ValidationError(`The ${label} pool was not found.`, { reason: "pool_not_found" });
        }

        const isOwner = await isPoolUserTopHolder(poolId, userId);
        if (!isOwner) {
            throw new ValidationError(`The ${label === "offered" ? "requester" : "recipient"} must be a top holder of the ${label} pool.`, {
                reason: "pool_not_owned",
            });
        }

        return { sourceType: "pool", poolId, items: null, digipogs };
    }

    throw new ValidationError(`The ${label} source type must be 'inventory' or 'pool'.`, { reason: "invalid_source_type" });
}

/**
 * Assert a pool holds at least the required digipog amount.
 * @param {number} poolId
 * @param {number} amount
 * @returns {Promise<void>}
 */
async function checkPoolBalanceAvailability(poolId, amount) {
    const pool = await dbGet("SELECT amount FROM digipog_pools WHERE id = ?", [poolId]);
    if (!pool) {
        throw new ValidationError(`Pool ${poolId} not found.`, { reason: "pool_not_found" });
    }
    if (pool.amount < amount) {
        throw new ValidationError(`Pool ${poolId} has insufficient balance: need ${amount}, have ${pool.amount}.`, {
            reason: "insufficient_pool_balance",
        });
    }
}

/**
 * Format an exchange payload into the old trade payload
 * @param {Object} party
 * @returns {Object}
 */
function formatTradePayload(party) {
    let payload = {};
    
    for (const [itemId, quantity] of Object.entries(JSON.parse(party))) {
        if (itemId === "0") {
            payload.digipogs = quantity;
        } else {
            payload.items ??= [];
            payload.items.push({itemId: Number(itemId), quantity});
        }
    }

    return payload
}

/**
 * Format a raw database trade row into the public API shape.
 * @param {Object} row
 * @returns {Object}
 */
function formatTrade(row) {
    const offered = {
        source: {
            type: row.from_type === "user" ? "inventory" : row.from_type,
            ...(row.from_id != null ? { poolId: row.from_id } : {}),
        },
        ...formatTradePayload(row.offer),
    };

    const requested = {
        source: {
            type: row.to_type === "user" ? "inventory" : row.to_type,
            ...(row.to_id != null ? { poolId: row.to_id } : {}),
        },
        ...formatTradePayload(row.request),
    };

    return {
        id: row.id,
        fromUserId: row.from_user_id,
        toUserId: row.to_user_id,
        offered,
        requested,
        status: row.status,
        failureReason: row.failure_reason || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

/**
 * Build a paginated trade bucket response.
 * @param {Object[]} rows - Trade rows.
 * @param {Object|null} countRow - Count query row.
 * @param {number} limit
 * @param {number} offset
 * @returns {Object}
 */
function buildTradeBucket(rows, countRow, limit, offset) {
    const items = rows.map(formatTrade);
    return {
        items,
        ...buildPagination(countRow ? countRow.count : 0, limit, offset, items.length),
    };
}

/**
 * Create a new pending trade. Validates both sides and checks current balances
 * (without debiting anything). Notifies the recipient.
 * @param {Object} opts
 * @param {number} opts.fromUserId
 * @param {number} opts.toUserId
 * @param {Object} opts.offered
 * @param {Object} opts.requested
 * @returns {Promise<{tradeId: number}>}
 */
async function createTrade({ fromUserId, toUserId, offered, requested }) {
    if (fromUserId === toUserId) {
        throw new ValidationError("You cannot trade with yourself.", { reason: "self_trade" });
    }

    const toUser = await dbGet("SELECT id FROM users WHERE id = ?", [toUserId]);
    if (!toUser) {
        throw new NotFoundError("Recipient user not found.");
    }

    const [offeredSide, requestedSide] = await Promise.all([
        validateSide(offered, fromUserId, "offered"),
        validateSide(requested, toUserId, "requested"),
    ]);

    const exchangeOffer = {};
    for (const { itemId, quantity } of offeredSide.items ?? []) {
        exchangeOffer[itemId] = quantity;
    }
    if (offeredSide.digipogs) exchangeOffer["0"] = offeredSide.digipogs;

    const exchangeRequest = {};
    for (const { itemId, quantity } of requestedSide.items ?? []) {
        exchangeRequest[itemId] = quantity;
    }
    if (requestedSide.digipogs) exchangeRequest["0"] = requestedSide.digipogs;

    // Create-time availability checks (no debits).
    if (offeredSide.sourceType === "inventory") {
        await checkInventoryAvailability(fromUserId, offeredSide.items);
    } else {
        await checkPoolBalanceAvailability(offeredSide.poolId, offeredSide.digipogs);
    }

    if (requestedSide.sourceType === "inventory") {
        await checkInventoryAvailability(toUserId, requestedSide.items);
    } else {
        await checkPoolBalanceAvailability(requestedSide.poolId, requestedSide.digipogs);
    }

    const now = new Date().toISOString();
    const tradeId = await dbRun(
        `INSERT INTO exchanges (from_user_id, from_id, from_type, offer, to_user_id, to_id, to_type,
                                request, reason, status, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Trade', 'pending', ?, ?)`,
        [
            fromUserId,
            offeredSide.poolId,
            offeredSide.sourceType === "inventory" ? "user" : offeredSide.sourceType,
            JSON.stringify(exchangeOffer),
            toUserId,
            requestedSide.poolId,
            requestedSide.sourceType === "inventory" ? "user" : requestedSide.sourceType,
            JSON.stringify(exchangeRequest),
            now,
            now,
        ]
    );

    await createNotification(toUserId, "trade_received", { tradeId, fromUserId });

    return { tradeId, message: `This endpoint is deprecated. Check the docs for endpoints under the "Exchanges" category` };
}

/**
 * Get all trades for a user organized into status buckets with pagination.
 * Each bucket shares the same limit/offset (applied independently per bucket).
 * @param {number} userId
 * @param {Object} [opts]
 * @param {number} [opts.limit=20]
 * @param {number} [opts.offset=0]
 * @returns {Promise<Object>}
 */
async function getTradesForUser(userId, { limit = 20, offset = 0 } = {}) {
    const [inboundCount, inbound, outboundCount, outbound, completedCount, completed, inactiveCount, inactive] = await Promise.all([
        dbGet("SELECT COUNT(*) AS count FROM exchanges WHERE to_user_id = ? AND status = 'pending'", [userId]),
        dbGetAll("SELECT * FROM exchanges WHERE to_user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT ? OFFSET ?", [userId, limit, offset]),
        dbGet("SELECT COUNT(*) AS count FROM exchanges WHERE from_user_id = ? AND status = 'pending'", [userId]),
        dbGetAll("SELECT * FROM exchanges WHERE from_user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT ? OFFSET ?", [
            userId,
            limit,
            offset,
        ]),
        dbGet("SELECT COUNT(*) AS count FROM exchanges WHERE (from_user_id = ? OR to_user_id = ?) AND status = 'completed' AND request != '{}'", [userId, userId]),
        dbGetAll("SELECT * FROM exchanges WHERE (from_user_id = ? OR to_user_id = ?) AND status = 'completed' AND request != '{}' ORDER BY updated_at DESC LIMIT ? OFFSET ?", [
            userId,
            userId,
            limit,
            offset,
        ]),
        dbGet("SELECT COUNT(*) AS count FROM exchanges WHERE (from_user_id = ? OR to_user_id = ?) AND status IN ('rejected', 'canceled', 'failed')", [
            userId,
            userId,
        ]),
        dbGetAll(
            "SELECT * FROM exchanges WHERE (from_user_id = ? OR to_user_id = ?) AND status IN ('rejected', 'canceled', 'failed') ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            [userId, userId, limit, offset]
        ),
    ]);

    return {
        inbound: buildTradeBucket(inbound, inboundCount, limit, offset),
        outbound: buildTradeBucket(outbound, outboundCount, limit, offset),
        completed: buildTradeBucket(completed, completedCount, limit, offset),
        inactive: buildTradeBucket(inactive, inactiveCount, limit, offset),
    };
}

/**
 * Get a single trade by ID. Returns null if the requesting user is not a participant
 * (caller should treat this as a 404 to avoid revealing existence to non-participants).
 * @param {number} tradeId
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
async function getTradeById(tradeId, userId) {
    const row = await dbGet("SELECT * FROM exchanges WHERE id = ?", [tradeId]);
    if (!row || (row.from_user_id !== userId && row.to_user_id !== userId)) {
        return null;
    }
    return formatTrade(row);
}

/**
 * Accept a pending trade as the recipient. Atomically re-checks both sides and
 * exchanges assets. Sets status to 'failed' (with no partial movement) if any
 * asset is no longer available. Notifies both participants of the outcome.
 * @param {number} tradeId
 * @param {number} userId - Must be the trade's to_user.
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
async function acceptTrade(tradeId, userId) {
    const now = new Date().toISOString();
    let fromUserId;
    let toUserId;

    try {
        await dbRun("BEGIN IMMEDIATE TRANSACTION");

        const trade = await dbGet("SELECT * FROM exchanges WHERE id = ?", [tradeId]);

        if (!trade || (trade.from_user_id !== userId && trade.to_user_id !== userId)) {
            throw new NotFoundError("Trade not found.");
        }

        if (trade.to_user_id !== userId) {
            throw new ForbiddenError("Only the recipient can accept a trade.", { reason: "not_recipient" });
        }

        if (trade.status !== "pending") {
            throw new ValidationError("This trade is no longer pending.", { reason: "invalid_status", status: trade.status });
        }

        fromUserId = trade.from_user_id;
        toUserId = trade.to_user_id;
        const offer = JSON.parse(trade.offer);
        const request = JSON.parse(trade.request);

        // Helper for filtering non-digipog
        function getPayloadItems(payload) {
            let items = {};
            for (const [itemId, quantity] of Object.entries(payload)) {
                if (itemId !== "0") {
                    items[itemId] = quantity;
                }
            }
            return items;
        }
        
        const offerItems = getPayloadItems(offer);
        const requestItems = getPayloadItems(request);
        const offerDigipogs = offer["0"] ?? 0;
        const requestDigipogs = request["0"] ?? 0;
        
        /**
         * Mark the trade as failed, commit, and notify both participants. Returns a
         * result object so callers can return immediately after this helper.
         */
        async function failTrade(reason) {
            await dbRun("UPDATE exchanges SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?", [reason, now, tradeId]);
            await dbRun("COMMIT");
            await Promise.allSettled([
                createNotification(fromUserId, "trade_failed", { tradeId, reason }),
                createNotification(toUserId, "trade_failed", { tradeId, reason }),
            ]);
            return { success: false, reason };
        }

        // Re-check offered (from) side.
        if (trade.from_type === "user") {
            for (const [ itemId, quantity ] of Object.entries(offerItems)) {
                const total = await getInventoryTotal(fromUserId, itemId);
                if (total < quantity) {
                    return await failTrade("Requester no longer has sufficient inventory.");
                }
            }
        } else {
            const stillOwner = await isPoolUserTopHolder(trade.from_id, fromUserId);
            if (!stillOwner) {
                return await failTrade("Requester is no longer a top holder.");
            }
            const pool = await dbGet("SELECT amount FROM digipog_pools WHERE id = ?", [trade.from_id]);
            if (!pool || pool.amount < offerDigipogs) {
                return await failTrade("Requester's pool no longer has sufficient balance.");
            }
        }

        // Re-check requested (to) side.
        if (trade.to_type === "user") {
            for (const [ itemId, quantity ] of Object.entries(requestItems)) {
                const total = await getInventoryTotal(toUserId, itemId);
                if (total < quantity) {
                    return await failTrade("Recipient no longer has sufficient items.");
                }
            }
        } else {
            const stillOwner = await isPoolUserTopHolder(trade.to_id, toUserId);
            if (!stillOwner) {
                return await failTrade("Recipient is no longer a top holder.");
            }
            const pool = await dbGet("SELECT amount FROM digipog_pools WHERE id = ?", [trade.to_id]);
            if (!pool || pool.amount < requestDigipogs) {
                return await failTrade("Recipient's pool no longer has sufficient balance.");
            }
        }

        if (trade.from_type === "user") {
            for (const [ itemId, quantity ] of Object.entries(offerItems)) {
                await strictRemoveFromInventory(fromUserId, itemId, quantity);
            }
        } else {
            await dbRun("UPDATE digipog_pools SET amount = amount - ? WHERE id = ?", [offerDigipogs, trade.from_id]);
        }

        if (trade.to_type === "user") {
            for (const [ itemId, quantity ] of Object.entries(requestItems)) {
                await strictRemoveFromInventory(toUserId, itemId, quantity);
            }
        } else {
            await dbRun("UPDATE digipog_pools SET amount = amount - ? WHERE id = ?", [requestDigipogs, trade.to_id]);
        }

        // toUser receives whatever fromUser offered.
        if (trade.from_type === "user") {
            for (const [ itemId, quantity ] of Object.entries(offerItems)) {
                await addItemToInventory(toUserId, itemId, quantity);
            }
        } else {
            // Digipogs from fromUser's pool go to toUser; credit destination depends
            // on toUser's own source type.
            await creditDigipogTransferRecipient(
                offerDigipogs,
                trade.to_type,
                trade.to_type === "pool" ? trade.to_id : toUserId
            );
        }

        // fromUser receives whatever toUser offered.
        if (trade.to_type === "user") {
            for (const [ itemId, quantity ] of Object.entries(requestItems)) {
                await addItemToInventory(fromUserId, itemId, quantity);
            }
        } else {
            // Digipogs from toUser's pool go to fromUser; credit destination depends
            // on fromUser's own source type.
            await creditDigipogTransferRecipient(
                requestDigipogs,
                trade.from_type === "pool" ? "pool" : "user",
                trade.from_type === "pool" ? trade.from_id : fromUserId
            );
        }

        await dbRun("UPDATE exchanges SET status = 'completed', updated_at = ? WHERE id = ?", [now, tradeId]);
        await dbRun("COMMIT");
    } catch (err) {
        try {
            await dbRun("ROLLBACK");
        } catch {}
        throw err;
    }

    await Promise.allSettled([
        createNotification(fromUserId, "trade_completed", { tradeId }),
        createNotification(toUserId, "trade_completed", { tradeId }),
    ]);

    return { success: true };
}

/**
 * Reject a pending trade as the recipient.
 * @param {number} tradeId
 * @param {number} userId - Must be the trade's to_user.
 * @returns {Promise<void>}
 */
async function rejectTrade(tradeId, userId) {
    const now = new Date().toISOString();
    let requesterId;

    try {
        await dbRun("BEGIN IMMEDIATE TRANSACTION");

        const trade = await dbGet("SELECT * FROM exchanges WHERE id = ?", [tradeId]);

        if (!trade || (trade.from_user_id !== userId && trade.to_user_id !== userId)) {
            throw new NotFoundError("Trade not found.");
        }

        if (trade.to_type === "user") {
            if (trade.to_user_id !== userId) {
                throw new ForbiddenError("Only the recipient can reject a trade.", { reason: "not_recipient" });
            }
        } else {
            const isStillTopHolder = isPoolUserTopHolder(trade.to_id, trade.to_user_id);
            if (!isStillTopHolder)
                throw new ForbiddenError("Only the top pool holder can reject a trade.", { reason: "not_recipient" });
        }

        if (trade.status !== "pending") {
            throw new ValidationError("This trade is no longer pending.", { reason: "invalid_status", status: trade.status });
        }

        requesterId = trade.from_user_id;

        await dbRun("UPDATE exchanges SET status = 'rejected', updated_at = ? WHERE id = ?", [now, tradeId]);
        await dbRun("COMMIT");
    } catch (err) {
        try {
            await dbRun("ROLLBACK");
        } catch {}
        throw err;
    }

    try {
        await createNotification(requesterId, "trade_rejected", { tradeId });
    } catch {}
}

/**
 * Cancel a pending trade as the requester.
 * @param {number} tradeId
 * @param {number} userId - Must be the trade's from_user_id.
 * @returns {Promise<void>}
 */
async function cancelTrade(tradeId, userId) {
    const now = new Date().toISOString();
    let recipientId;

    try {
        await dbRun("BEGIN IMMEDIATE TRANSACTION");

        const trade = await dbGet("SELECT * FROM exchanges WHERE id = ?", [tradeId]);

        if (!trade || (trade.from_user_id !== userId && trade.to_user_id !== userId)) {
            throw new NotFoundError("Trade not found.");
        }
        if (trade.from_user_id !== userId) {
            throw new ForbiddenError("Only the requester can cancel a trade.", { reason: "not_requester" });
        }
        if (trade.status !== "pending") {
            throw new ValidationError("This trade is no longer pending.", { reason: "invalid_status", status: trade.status });
        }

        recipientId = trade.to_user_id;

        await dbRun("UPDATE exchanges SET status = 'canceled', updated_at = ? WHERE id = ?", [now, tradeId]);
        await dbRun("COMMIT");
    } catch (err) {
        try {
            await dbRun("ROLLBACK");
        } catch {}
        throw err;
    }

    try {
        await createNotification(recipientId, "trade_canceled", { tradeId });
    } catch {}
}

module.exports = {
    normalizeItems,
    createTrade,
    getTradesForUser,
    getTradeById,
    acceptTrade,
    rejectTrade,
    cancelTrade,
};
