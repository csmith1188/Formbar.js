const { dbGet, dbGetAll, dbRun } = require("@modules/database");
const NotFoundError = require("@errors/not-found-error");

/**
 * Get a user inventory.
 * @param {number} userId - userId.
 * @returns {Promise<Object[]>}
 */
async function getUserInventory(userId) {
    const items = new Map();

    // gets all inventory rows (stored as item ID with quantity)
    const inventoryRows = await dbGetAll(
        `SELECT i.item_id, i.quantity,
                r.id, r.name, r.description, r.stack_size, r.image_url
         FROM inventory i
         INNER JOIN item_registry r ON r.id = i.item_id
         WHERE i.user_id = ?`,
        [userId]
    );

    for (const row of inventoryRows) {
        const itemInfo = {
            id: row.id,
            name: row.name,
            description: row.description,
            stack_size: row.stack_size,
            image_url: row.image_url,
            quantity: row.quantity,
        };

        const itemIndex = row.item_id - 1; // item IDs are 1-indexed, but we'll use 0-indexing for the map

        // if item hasn't been added to the itemsMap, add it
        if (!items.has(itemIndex)) {
            items.set(itemIndex, itemInfo);
        } else {
            // if it has been added, increment the quantity
            const existing = items.get(itemIndex);
            existing.quantity += row.quantity;
        }
    }

    return Array.from(items.values());
}

/**
 * Create an inventory item.
 * @param {Object} itemData - Item data.
 * @param {string} itemData.name - Item name.
 * @param {string} itemData.description - Item description.
 * @param {number} [itemData.stackSize] - Maximum stack size.
 * @param {string} [itemData.iconUrl] - Item icon URL.
 * @returns {Promise<number>}
 */
async function registerItem({ name, description, stackSize = 1, iconUrl = "" }) {
    const itemId = await dbRun("INSERT INTO item_registry (name, description, stack_size, image_url) VALUES (?, ?, ?, ?)", [
        name,
        description,
        stackSize,
        iconUrl,
    ]);
    return itemId;
}

/**
 * Get item info by id.
 * @param {number} itemId
 * @returns {Promise<Object>}
 */
async function getItemById(itemId) {
    const item = await dbGet("SELECT * FROM item_registry WHERE id = ?", [itemId]);
    if (!item) {
        throw new NotFoundError("Item not found");
    }
    return item;
}

/**
 * Get the stack size of an item with the least quantity in the user's inventory.
 * @param {number} userId - userId.
 * @param {number} itemId - itemId.
 * @returns {Promise<number>}
 */
async function getItemStackWithLeastQuantity(userId, itemId) {
    return dbGet("SELECT id, quantity FROM inventory WHERE user_id = ? AND item_id = ? ORDER BY quantity ASC LIMIT 1", [userId, itemId]);
}

/**
 * Add quantity of an item to a user inventory.
 * @param {number} userId - userId.
 * @param {Object} itemId - itemId.
 * @param {number} quantity - quantity.
 * @returns {Promise<void>}
 */
async function addItemToInventory(userId, itemId, quantity) {
    const itemInfo = await dbGet("SELECT stack_size FROM item_registry WHERE id = ?", [itemId]);
    if (!itemInfo) {
        throw new NotFoundError("Item not found in registry");
    }

    const stackSize = itemInfo.stack_size > 0 ? itemInfo.stack_size : Number.POSITIVE_INFINITY;
    let remainingQuantity = quantity;

    // Fill the smallest existing stack first, then create new stacks for overflow.
    const existingItemStack = await getItemStackWithLeastQuantity(userId, itemId);
    if (existingItemStack) {
        const newQuantity = existingItemStack.quantity + remainingQuantity;

        if (newQuantity > stackSize) {
            await dbRun("UPDATE inventory SET quantity = ? WHERE id = ?", [stackSize, existingItemStack.id]);
            remainingQuantity = newQuantity - stackSize;
        } else {
            await dbRun("UPDATE inventory SET quantity = ? WHERE id = ?", [newQuantity, existingItemStack.id]);
            remainingQuantity = 0;
        }
    }

    while (remainingQuantity > 0) {
        const stackQuantity = Math.min(remainingQuantity, stackSize);
        await dbRun("INSERT INTO inventory (user_id, item_id, quantity) VALUES (?, ?, ?)", [userId, itemId, stackQuantity]);
        remainingQuantity -= stackQuantity;
    }
}

/**
 * Remove quantity of an item from a user inventory.
 * @param {number} userId - userId.
 * @param {Object} itemId - itemId.
 * @param {number} quantity - quantity.
 * @returns {Promise<void>}
 */
async function removeItemFromInventory(userId, itemId, quantity) {
    const existingItems = await dbGetAll("SELECT id, quantity FROM inventory WHERE user_id = ? AND item_id = ? ORDER BY id DESC", [userId, itemId]);
    if (existingItems.length === 0) {
        throw new NotFoundError("Item not found in inventory");
    }
	
	//? Check if this item is a pool share item.
	const sharePool = await dbGet("SELECT * FROM digipog_pools WHERE share_item = ? LIMIT 1", [itemId]);
	let topShareholder;
	if(sharePool) {
		const shareholders = await dbGetAll('SELECT * FROM inventory WHERE item_id = ?', [itemId])
		topShareholder = shareholders.sort((shareholderA, shareholderB) => shareholderB.quantity - shareholderA.quantity)[0];
	}

    let remainingQuantity = quantity;

    for (const item of existingItems) {
        if (remainingQuantity <= 0) {
            break;
        }

        const newQuantity = item.quantity - remainingQuantity;

        if (newQuantity > 0) {
            await dbRun("UPDATE inventory SET quantity = ? WHERE id = ?", [newQuantity, item.id]);
            remainingQuantity = 0;
        } else {
            await dbRun("DELETE FROM inventory WHERE id = ?", [item.id]);
            remainingQuantity = Math.abs(newQuantity);
        }

		if(topShareholder) {
        	const topNewQuantity = topShareholder.quantity + quantity;
			await dbRun("UPDATE inventory SET quantity = ? WHERE id = ?", [topNewQuantity, topShareholder.id]);
		}
    }
}

module.exports = {
    getUserInventory,
    registerItem,
    getItemById,
    addItemToInventory,
    removeItemFromInventory,
};
