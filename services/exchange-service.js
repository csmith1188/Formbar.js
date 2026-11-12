const { dbGet, dbRun, dbGetAll } = require("@modules/database");
const { creditDigipogTransferRecipient, getPoolById, verifyPoolPin, getTopHoldingPoolsForUser } = require("@services/digipog-service");
const { getUserDataFromDb, verifyPin } = require("@services/user-service");
const { addItemToInventory, getItemById } = require("@services/inventory-service");
const { createNotification } = require("@services/notification-service");
const ValidationError = require("@errors/validation-error");
const ForbiddenError = require("@errors/forbidden-error");
const NotFoundError = require("@errors/not-found-error");
const AppError = require("@errors/app-error");

const ALLOWED_EXCHANGE_TYPES = ["user", "pool"];

/**
 * Filters for only the item IDs of payload
 * @param {Object} payload - An object with item IDs as keys and quantities as values
 * @returns {Object} A new object containing only non-zero item IDs with their quantities
 */

function getPayloadItems(payload) {
    let items = {};
    for (const [itemId, quantity] of Object.entries(payload)) {
        if (itemId !== "0") {
            items[itemId] = quantity;
        }
    }
    return items;
}

/**
 * Get the total quantity of an item held by a user.
 * @param {number} userId
 * @param {number|string} itemId
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
    for (const [itemId, quantity] of Object.entries(items)) {
        const total = await getInventoryTotal(userId, itemId);
        if (total < quantity) {
            throw new ForbiddenError(`Insufficient inventory for item ${itemId}: need ${quantity}, have ${total}.`, {
                reason: "insufficient_inventory",
                itemId,
            });
        }
    }
}

/**
 * Simply transfers digipogs from one user to another.
 * exchangeDigipogs from digipog service works with API objects
 * @param {number} amount
 * @param {string} fromType
 * @param {number} fromId
 * @param {string} toType
 * @param {number} toId
 */
async function exchangeDigipogs(amount, fromType, fromId, toType, toId) {
    if (fromType === "user") {
        await dbRun("UPDATE users SET digipogs = digipogs - ? WHERE id = ? AND digipogs >= ?", [
            amount,
            fromId,
            amount,
        ]);
    } else {
        await dbRun("UPDATE digipog_pools SET amount = amount - ? WHERE id = ? AND amount >= ?", [
            amount,
            fromId,
            amount,
        ]);
    }

    creditDigipogTransferRecipient(amount, toType, toId);
}

/**
 * Remove an exact quantity of an item from a user's inventory stacks. Throws
 * if the user does not hold enough. This is the strict variant used during
 * exchange acceptance; it does NOT alter the permissive removeItemFromInventory
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
        throw new ForbiddenError(`Insufficient inventory: need ${quantity} of item ${itemId}, have ${total}.`);
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
 * Get the user ID of the top holder associated with a pool.
 * @param {number} poolId
 * @returns {Promise<number>}
 */
async function getTopPoolHolderId(poolId) {
    const row = await dbGet("SELECT share_item FROM digipog_pools WHERE id = ?", [poolId]);
    return (await dbGet("SELECT user_id FROM inventory WHERE item_id = ? ORDER BY quantity DESC", [row.share_item])).user_id;
}

/**
 * Validate an exchange party and its offered or requested resources.
 * @param {{id: number, type: "user"|"pool", pin?: string}} exchangeParty
 * @param {Record<string, number>} payload Item IDs mapped to quantities.
 * @param {string} name
 * @param {string} payloadName
 * @returns {Promise<Object>} The validated user or pool account.
 */
async function validateExchangePartyFields(exchangeParty, payload, name, payloadName) {
    // Check if well-formed
    if (typeof exchangeParty !== "object") {
        throw new ValidationError(`'${name}' must be an object.`);
    }
    if (exchangeParty.id == null || exchangeParty.id <= 0) {
        throw new ValidationError(`'id' field of '${name}' must be a valid user or pool ID.`);
    }
    if (exchangeParty.type == null || !(ALLOWED_EXCHANGE_TYPES.includes(exchangeParty.type))) {
        throw new ValidationError(`'type' field of '${name}' must be either 'user' or 'pool'.`);
    }

    let exchangeAccount = exchangeParty.type === "user" ? await getUserDataFromDb(exchangeParty.id) : await getPoolById(exchangeParty.id);
    if (exchangeAccount == null) {
        throw new NotFoundError(`'id' field '${name}' is not associated with a valid ${exchangeParty.type}.`);
    }

    if (typeof payload !== "object") {
        throw new ValidationError(`'${payloadName}' field of '${name}' must be an object with IDs as keys and quantities as values.`);
    } else {
        for (const [itemId, quantity] of Object.entries(payload)) {
            // Check if payload is well-formed
            const itemIdNum = Number(itemId);

            if (!Number.isInteger(itemIdNum) || itemIdNum < 0) {
                throw new ValidationError(`'${payloadName}' must have valid IDs as keys (0 = digipogs, 1+ = item IDs).`);
            }

            if (!Number.isInteger(quantity) || quantity <= 0) {
                throw new ValidationError(`'${payloadName}' must have positive integer values as quantities.`);
            }

            // Non-digipogs need additional checks
            if (itemIdNum !== 0) {
                if (exchangeParty.type === "pool") {
                    throw new ValidationError(`'${payloadName}' cannot contain items because it is of type 'pool'.`);
                }

                try {
                    await getItemById(itemId);
                } catch (err) {
                    throw new NotFoundError(`Item ID ${itemId} is not associated with a valid item.`);
                }
            }
        }
    }

    return exchangeAccount;
}

/**
 * Validate the requesting party, including its resources and PIN.
 * @param {{id: number, type: "user"|"pool", pin?: string}} fromParty
 * @param {Record<string, number>} fromPayload
 * @param {string} name
 * @param {string} payloadName
 * @returns {Promise<Object>} The validated user or pool account.
 */
async function validateRequesterPartyFields(fromParty, fromPayload, name, payloadName) {
    const fromAccount = await validateExchangePartyFields(fromParty, fromPayload, name, payloadName);

    if (Object.keys(fromPayload).length === 0) {
        throw new ValidationError(`'${payloadName}' can not be empty.`);
    }

    // Requester makes exchange with resources they have
    // Recipient only needs them when accepting
    if (fromParty.type === "user") {
        if (typeof fromPayload["0"] === "number" && fromAccount.digipogs < fromPayload["0"]) {
            throw new ForbiddenError(`The requester has insufficient digipog balance: need ${fromPayload["0"]}, have ${fromAccount.digipogs}.`);
        }
        await checkInventoryAvailability(fromAccount.id, getPayloadItems(fromPayload));
    } else {
        if (fromAccount.amount < fromPayload["0"]) {
            throw new ForbiddenError(`The requester pool has insufficient digipog balance: need ${fromPayload["0"]}, have ${fromAccount.amount}.`);
        }
    }

    if (fromParty.pin == null) {
        throw new ValidationError(`'pin' field of '${name}' is required.`);
    }

    if (fromParty.type === "user") await verifyPin(fromAccount.id, fromParty.pin);
    if (fromParty.type === "pool") await verifyPoolPin(fromAccount.id, fromParty.pin);

    return fromAccount;
}

/**
 * Create a trade or immediately complete a one-way transaction.
 * @param {{to: {id: number, type: "user"|"pool", request: Record<string, number>}, from: {id: number, type: "user"|"pool", pin: string, offer: Record<string, number>}, reason?: string}} exchange
 * @returns {Promise<{status: number, exchangeId: number}>}
 */
async function createExchange(exchange) {
    const { to, from, reason } = exchange;
    await validateExchangePartyFields(to, to.request, "to", "request");
    const fromAccount = await validateRequesterPartyFields(from, from.offer, "from", "offer");

    if (to.id === from.id && to.type === from.type) {
        throw new ValidationError("You cannot exchange with yourself.");
    }

    to.poolId = to.type === "pool" ? to.id : null;
    to.userId = to.type === "user" ? to.id : await getTopPoolHolderId(to.poolId);
    from.userId = from.type === "user" ? from.id : from.userId;
    from.poolId = from.type === "pool" ? from.id : null;

    const offerDigipogs = from.offer["0"] ?? 0;
    const requestItems = getPayloadItems(to.request);
    const offerItems = getPayloadItems(from.offer);

    if ((Object.keys(requestItems) > 0 && from.type === "pool") ||
        (Object.keys(offerItems) > 0 && to.type === "pool")) {
        throw new ValidationError("Pools can not receive items.");
    }

    const now = new Date().toISOString();

    let status = 400;
    let exchangeId;
    // Treat as a trade if there is a request
    // Otherwise treat it as a transaction
    if (Object.keys(to.request).length > 0) {
        exchangeId = await dbRun(
            `INSERT INTO exchanges (from_user_id, from_id, from_type, offer, to_user_id, to_id, to_type,
                                    request, reason, status, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
            [
                from.userId,
                from.poolId,
                from.type,
                JSON.stringify(from.offer),
                to.userId,
                to.poolId,
                to.type,
                JSON.stringify(to.request),
                reason ?? "Trade",
                now,
                now,
            ]
        );
        status = 201;

        await createNotification(to.userId, "exchange_received", { exchangeId, fromUserId: from.userId });
    } else {
        try {
            await dbRun("BEGIN IMMEDIATE TRANSACTION");
            {
                if (offerDigipogs > 0) {
                    exchangeDigipogs(offerDigipogs, from.type, from.id, to.type, to.id);
                }
                // Transfer items
                for (const [itemId, quantity] of Object.entries(offerItems)) {
                    await strictRemoveFromInventory(from.userId, itemId, quantity);
                    await addItemToInventory(to.userId, itemId, quantity);
                }
                // Log exchange
                exchangeId = await dbRun(
                    `INSERT INTO exchanges (from_user_id, from_id, from_type, offer, to_user_id, to_id, to_type,
                                request, reason, status, created_at, updated_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
                    [
                        from.userId,
                        from.poolId,
                        from.type,
                        JSON.stringify(from.offer),
                        to.userId,
                        to.poolId,
                        to.type,
                        JSON.stringify(to.request),
                        reason ?? "Transaction",
                        now,
                        now,
                    ]
                );
                await Promise.allSettled([
                    createNotification(from.userId, "exchange_completed", { exchangeId }),
                    createNotification(to.userId, "exchange_completed", { exchangeId }),
                ]);
            }
            await dbRun("COMMIT");

            status = 200;
        } catch (err) {
            await dbRun("ROLLBACK");
            throw err;
        }
    }

    if (exchangeId == null) {
        throw new AppError("Exchange failed.");
    }

    return { status, exchangeId };
}

/**
 * Accept a pending exchange and transfer its resources.
 * @param {number} exchangeId
 * @param {string} pin
 * @returns {Promise<{success: boolean}>}
 */
async function acceptExchange(exchangeId, pin) {
    const exchange = await dbGet("SELECT * FROM exchanges WHERE id = ?", [exchangeId]);

    // Validation/Authorization
    if (!exchange || exchange.status !== "pending") {
        throw new ValidationError("This exchange is no longer pending.", { reason: "invalid_status", status: exchange.status });
    }

    if (exchange.to_type === "user") await verifyPin(exchange.to_user_id, pin);
    if (exchange.to_type === "pool") await verifyPoolPin(exchange.to_id, pin);

    // Deconstructing offer and request fields
    const offer = JSON.parse(exchange.offer);
    const request = JSON.parse(exchange.request);

    const offerId = exchange.from_id ?? exchange.from_user_id;
    const requestId = exchange.to_id ?? exchange.to_user_id;
    const offerItems = getPayloadItems(offer);
    const requestItems = getPayloadItems(request);
    const offerDigipogs = offer["0"] ?? 0;
    const requestDigipogs = request["0"] ?? 0;

    const now = new Date().toISOString()

    // Fail trade if insufficient items or digipogs
    /**
     * Ensure an exchange participant still holds the required resources.
     * @param {"user"|"pool"} type
     * @param {number} id
     * @param {number} digipogs
     * @param {Record<string, number>} items
     * @param {string} name
     * @returns {Promise<void>}
     */
    async function checkResources(type, id, digipogs, items, name) {
        if (type === "user") {
            const user = await getUserDataFromDb(id);
            if (!user) {
                throw new NotFoundError(`${name} is no longer associated with a valid user.`, { reason: "invalid_user" });
            }
            if (user.digipogs < digipogs) {
                throw new ForbiddenError(`${name} has insufficient funds: need ${digipogs}, have ${user.digipogs}.`, { reason: "insufficient_funds" });
            }
            await checkInventoryAvailability(user.id, items);
        } else {
            const pool = await getPoolById(id);
            if (!pool) {
                throw new NotFoundError(`${name} is no longer associated with a valid pool.`, { reason: "invalid_pool", id: id });
            }
            if (pool.amount < digipogs) {
                throw new ForbiddenError(`${name} has insufficient funds in pool: need ${digipogs}, have ${pool.amount}.`, { reason: "insufficient_pool_funds" });
            }
        }
    }

    try {
        await dbRun("BEGIN IMMEDIATE TRANSACTION");
        {
            // I did this error handling *not* great
            // Just adds the exchange to the error
            await checkResources(exchange.from_type, offerId, offerDigipogs, offerItems, "Creator");
            await checkResources(exchange.to_type, requestId, requestDigipogs, requestItems, "Recipient");

            // Transfer digipogs
            if (offerDigipogs > 0) await exchangeDigipogs(offerDigipogs, exchange.from_type, offerId, exchange.to_type, requestId);
            if (requestDigipogs > 0) await exchangeDigipogs(requestDigipogs, exchange.to_type, requestId, exchange.from_type, offerId);

            // Transfer resources
            for (const [itemId, quantity] of Object.entries(offerItems)) {
                await strictRemoveFromInventory(offerId, itemId, quantity);
                await addItemToInventory(requestId, itemId, quantity);
            }

            for (const [itemId, quantity] of Object.entries(requestItems)) {
                await strictRemoveFromInventory(requestId, itemId, quantity);
                await addItemToInventory(offerId, itemId, quantity);
            }

            await dbRun("UPDATE exchanges SET status = 'completed', updated_at = ? WHERE id = ?", [now, exchangeId]);
        }
        await dbRun("COMMIT");

        await Promise.allSettled([
            createNotification(exchange.from_user_id, "exchange_completed", { exchangeId: exchange.id }),
            createNotification(exchange.to_user_id, "exchange_completed", { exchangeId: exchange.id }),
        ]);

        return { success: true }
    } catch (err) {
        /**
         * Mark the exchange as failed, commit, and notify both participants. Throws the error
         * back up out of a catch.
         */
        await dbRun("ROLLBACK");
        await dbRun("UPDATE exchanges SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?", [err.reason, now, exchange.id]);
        await Promise.allSettled([
            createNotification(exchange.from_user_id, "exchange_failed", { exchangeId: exchange.id, reason: err.reason }),
            createNotification(exchange.to_user_id, "exchange_failed", { exchangeId: exchange.id, reason: err.reason }),
        ]);
        throw err;
    }
}

/**
 * Convert an exchange database row into the API response shape.
 * @param {Object} rawExchange Exchange row, including serialized offer/request fields.
 * @returns {Object} Formatted exchange.
 */
function formatExchangeFromDbToApi(rawExchange) {
    const formattedExchange = {
        id: rawExchange.id,
        to: {
            id: rawExchange.to_id ?? rawExchange.to_user_id,
            type: rawExchange.to_type,
            request: JSON.parse(rawExchange.request),
        },
        from: {
            id: rawExchange.from_id ?? rawExchange.from_user_id,
            type: rawExchange.from_type,
            offer: JSON.parse(rawExchange.offer),
        },
        reason: rawExchange.reason,
        status: rawExchange.status,
        created: rawExchange.created_at,
        updated: rawExchange.updated_at
    };

    if (rawExchange.failure_reason != null) {
        formattedExchange.failureReason = rawExchange.failure_reason;
    }

    return formattedExchange;
}

/**
 * Get an exchange if the user is a participant or a top pool holder.
 * @param {number} exchangeId
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
async function getExchangeById(exchangeId, userId) {
    const exchange = await dbGet("SELECT * FROM exchanges WHERE id = ?", [exchangeId]);
    const topHoldingPools = await getTopHoldingPoolsForUser(userId);
    if (!exchange ||
        (
            exchange.from_user_id !== userId &&
            exchange.to_user_id !== userId &&
            !topHoldingPools.includes(exchange.from_user_id) &&
            !topHoldingPools.includes(exchange.to_user_id)
        )
    ) {
        return null;
    }
    return formatExchangeFromDbToApi(exchange);
}

/**
 * List exchanges visible to a user, with pagination and optional filters.
 * @param {number} userId
 * @param {{limit?: number, offset?: number, filters?: string[]}} options
 * @returns {Promise<{success: boolean, data: {exchanges: Object[], total: number, limit: number, offset: number, hasMore: boolean}}>} 
 */
async function getExchangesForUser(userId, options) {
    options = {
        limit: 20,
        offset: 0,
        filters: ["included"],
        ...options
    };

    let { limit, offset, filters } = options;

    filters = new Set(filters);

    // Always include 'included' (inbound or outbound) by default if inbound or outbound is not specified
    if (!filters.has("inbound") && !filters.has("outbound") && !filters.has("included")) {
        filters.add("included");
    }

    // Filters that can be achieved with a simple sql condition
    const sqlFilters = {
        trade: "request != '{}'",
        transaction: "request = '{}'",
        inactive: "status IN ('rejected', 'canceled', 'failed')"
    }
    // Filters that are easier to implement in JS
    // All are functions that return a Promise<boolean>
    const jsFilters = {
        inbound: async (exchange) => {
            return exchange.to_user_id === userId || (await getTopHoldingPoolsForUser(userId)).includes(exchange.to_id);
        },
        outbound: async (exchange) => {
            return exchange.from_user_id === userId || (await getTopHoldingPoolsForUser(userId)).includes(exchange.from_id);
        },
        included: async (exchange) => {
            return (exchange.to_user_id === userId || (await getTopHoldingPoolsForUser(userId)).includes(exchange.to_id) ||
                exchange.from_user_id === userId || (await getTopHoldingPoolsForUser(userId)).includes(exchange.from_id));
        },
    }

    let activeSqlFilters = [];
    let statusFilters = [];
    let activeJsFilters = [];

    for (const filter of filters) {
        const sqlFilter = sqlFilters[filter];
        const jsFilter = jsFilters[filter];

        // Treat filter as filtering for a specific status if no sqlFilter of jsFilter defined
        // Use as statusFilters as binding parameters to avoid injection
        if (jsFilter == null && sqlFilter == null) {
            activeSqlFilters.push(`status = ?`);
            statusFilters.push(filter);
        } else if (sqlFilter != null) {
            activeSqlFilters.push(sqlFilter);
        }

        if (jsFilter != null) activeJsFilters.push(jsFilter);
    }

    let whereClause = activeSqlFilters.join(" AND ");
    if (whereClause !== "") {
        whereClause = "WHERE " + whereClause;
    }

    // Limit and offset can only be applied after jsFilters
    const exchanges = await dbGetAll("SELECT * FROM exchanges " + whereClause, statusFilters);
    let filteredExchanges = []

    for (const exchange of exchanges) {
        const filterResults = await Promise.allSettled(activeJsFilters.map((filter) => filter.call(this, exchange)));

        if (filterResults.every((result) => result.value)) {
            filteredExchanges.push(formatExchangeFromDbToApi(exchange));
        }
    }

    const finalExchanges = filteredExchanges.slice(offset, offset + limit);
    return {
        success: true,
        data: {
            exchanges: finalExchanges,
        },
        pagination: {
            total: filteredExchanges.length,
            limit,
            offset,
            hasMore: filteredExchanges.length > limit
        }
    }
}

/**
 * Cancel a pending exchange as its creator.
 * @param {number} exchangeId
 * @param {string} pin
 * @returns {Promise<void>}
 */
async function cancelExchange(exchangeId, pin) {
    const exchange = await dbGet("SELECT from_user_id, from_id, from_type, status FROM exchanges WHERE id = ?", [exchangeId]);

    if (!exchange) {
        throw new NotFoundError(`ID ${exchangeId} is not associated with a valid exchange.`)
    }

    const { from_user_id, from_id, from_type, status } = exchange;

    if (status !== "pending") {
        throw new ValidationError("This exchange is no longer pending.", { reason: "invalid_status", status: status });
    }


    if (from_type === "user") {
        await verifyPin(from_user_id, pin);
    } else {
        await verifyPoolPin(from_id, pin);
    }

    await dbRun("BEGIN IMMEDIATE TRANSACTION");
    {
        await dbRun("UPDATE exchanges SET status = 'canceled', failure_reason = 'Creator initiated cancel' WHERE id = ?", [exchangeId]);
    }
    await dbRun("COMMIT");

    await createNotification(from_user_id, "exchange_canceled", { exchangeId: exchange.id });
}

/**
 * Reject a pending exchange as its recipient.
 * @param {number} exchangeId
 * @param {string} pin
 * @returns {Promise<void>}
 */
async function rejectExchange(exchangeId, pin) {
    const exchange = await dbGet("SELECT to_user_id, to_id, to_type, status FROM exchanges WHERE id = ?", [exchangeId]);

    if (!exchange) {
        throw new NotFoundError(`ID ${exchangeId} is not associated with a valid exchange.`)
    }

    const { to_user_id, to_id, to_type, status } = exchange;

    if (status !== "pending") {
        throw new ValidationError("This exchange is no longer pending.", { reason: "invalid_status", status: status });
    }

    if (to_type === "user") {
        await verifyPin(to_user_id, pin);
    } else {
        await verifyPoolPin(to_id, pin);
    }

    await dbRun("BEGIN IMMEDIATE TRANSACTION");
    {
        await dbRun("UPDATE exchanges SET status = 'rejected', failure_reason = 'Recipient rejected the exchange' WHERE id = ?", [exchangeId]);
    }
    await dbRun("COMMIT");

    await createNotification(to_user_id, "exchange_rejected", { exchangeId: exchange.id });
}

module.exports = {
    createExchange,
    acceptExchange,
    getExchangeById,
    getExchangesForUser,
    cancelExchange,
    rejectExchange
}
