const { dbGet, dbRun } = require("@modules/database");

/**
 * Ensure the built-in developer pool exists.
 * @returns {Promise<void>}
 */
async function ensureFormbarDeveloperPool() {
    const formbarDevPool = await dbGet("SELECT * FROM digipog_pools WHERE id = 0");
    if (formbarDevPool) {
        return;
    }

    const itemId = await dbRun("INSERT INTO item_registry (name, description, stack_size) VALUES (?, ?, ?)", [
        `Formbar Developer Pool Share`,
        `Share of Formbar Developer Pool`,
        100,
    ]);

    await dbRun("INSERT INTO digipog_pools (id, name, description, amount, share_item) VALUES (?, ?, ?, ?, ?)", [
        0,
        "Formbar Developer Pool",
        "Formbar Developer pog pool. Accumulates from the 10% tax on digipog transactions.",
        0,
        itemId,
    ]);

    await dbRun("INSERT INTO inventory (user_id, item_id, quantity) VALUES (?, ?, ?)", [
        1,
        itemId,
        100
    ]);
}

module.exports = {
    ensureFormbarDeveloperPool,
};
