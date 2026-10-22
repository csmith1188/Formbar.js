const { createTestDb } = require("@test-helpers/db");

let mockDatabase;

jest.mock("@modules/database", () => {
    const dbProxy = new Proxy(
        {},
        {
            get(_, method) {
                return (...args) => mockDatabase.db[method](...args);
            },
        }
    );
    return {
        get database() {
            return dbProxy;
        },
        dbGet: (...args) => mockDatabase.dbGet(...args),
        dbRun: (...args) => mockDatabase.dbRun(...args),
        dbGetAll: (...args) => mockDatabase.dbGetAll(...args),
    };
});

const { normalizeItems, createTrade, getTradesForUser, getTradeById, acceptTrade, rejectTrade, cancelTrade } = require("@services/trade-service");
const ValidationError = require("@errors/validation-error");

async function seedUser(id, digipogs = 0) {
    await mockDatabase.dbRun("INSERT INTO users (id, email, password, API, secret, digipogs, verified) VALUES (?, ?, 'pw', ?, ?, ?, 1)", [
        id,
        `user${id}@example.com`,
        `api${id}`,
        `secret${id}`,
        digipogs,
    ]);
}

async function seedItem(id, name = "Item", stackSize = 100) {
    await mockDatabase.dbRun("INSERT INTO item_registry (id, name, description, stack_size) VALUES (?, ?, 'desc', ?)", [id, name, stackSize]);
}

async function seedInventory(userId, itemId, quantity) {
    await mockDatabase.dbRun("INSERT INTO inventory (user_id, item_id, quantity) VALUES (?, ?, ?)", [userId, itemId, quantity]);
}

async function seedPool(id, amount = 0) {
    await mockDatabase.dbRun("INSERT INTO digipog_pools (id, name, description, amount) VALUES (?, 'Pool', 'None', ?)", [id, amount]);
}

async function seedPoolOwner(poolId, userId) {
    await mockDatabase.dbRun("INSERT INTO digipog_pool_users (pool_id, user_id, owner) VALUES (?, ?, 1)", [poolId, userId]);
}

async function seedTrade(opts) {
    const exchangeOffer = {};
    for (const { itemId, quantity } of opts.offeredItems ?? []) {
        exchangeOffer[itemId] = quantity;
    }
    if (opts.offeredDigipogs) exchangeOffer["0"] = opts.offeredDigipogs;

    const exchangeRequest = {};
    for (const { itemId, quantity } of opts.requestedItems ?? []) {
        exchangeRequest[itemId] = quantity;
    }
    if (opts.requestedDigipogs) exchangeRequest["0"] = opts.requestedDigipogs;

    const now = new Date().toISOString();
    const tradeId = await mockDatabase.dbRun(
        `INSERT INTO exchanges (from_user_id, from_id, from_type, offer, to_user_id, to_id, to_type,
                                request, reason, status, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Trade', ?, ?, ?)`,
        [
            opts.fromUser,
            opts.fromPoolId ?? null,
            opts.fromSourceType === "inventory" || opts.fromSourceType == null ? "user" : opts.fromSourceType,
            Object.keys(exchangeOffer).length > 0 ? JSON.stringify(exchangeOffer) : "{}",
            opts.toUser,
            opts.toPoolId ?? null,
            opts.toSourceType === "inventory" || opts.toSourceType == null ? "user" : opts.toSourceType,
            Object.keys(exchangeRequest).length > 0 ? JSON.stringify(exchangeRequest) : "{}",
            opts.status ?? "pending",
            now,
            now,
        ]
    );
    return tradeId;
}

beforeAll(async () => {
    mockDatabase = await createTestDb();
});

afterEach(async () => {
    await mockDatabase.reset();
});

afterAll(async () => {
    await mockDatabase.close();
});

describe("normalizeItems()", () => {
    it("returns a normalized list for a valid input", () => {
        const result = normalizeItems([{ itemId: 1, quantity: 2 }]);
        expect(result).toEqual([{ itemId: 1, quantity: 2 }]);
    });

    it("aggregates duplicate itemIds", () => {
        const result = normalizeItems([
            { itemId: 1, quantity: 2 },
            { itemId: 1, quantity: 3 },
            { itemId: 2, quantity: 1 },
        ]);
        expect(result).toHaveLength(2);
        expect(result).toEqual(
            expect.arrayContaining([
                { itemId: 1, quantity: 5 },
                { itemId: 2, quantity: 1 },
            ])
        );
    });

    it("throws for an empty items array", () => {
        expect(() => normalizeItems([])).toThrow();
    });

    it("throws for non-integer itemId", () => {
        expect(() => normalizeItems([{ itemId: "abc", quantity: 1 }])).toThrow();
    });

    it("throws for non-positive quantity", () => {
        expect(() => normalizeItems([{ itemId: 1, quantity: 0 }])).toThrow();
    });

    it("throws for negative quantity", () => {
        expect(() => normalizeItems([{ itemId: 1, quantity: -5 }])).toThrow();
    });

    it("throws a ValidationError for malformed item entries", () => {
        const malformedInputs = [[null], [123], [{}]];

        malformedInputs.forEach((items) => {
            try {
                normalizeItems(items);
                throw new Error("Expected normalizeItems() to throw");
            } catch (error) {
                expect(error).toBeDefined();
                expect(error).toBeInstanceOf(ValidationError);
                expect(error).not.toBeInstanceOf(TypeError);
            }
        });
    });
});

describe("createTrade() - validation", () => {
    beforeEach(async () => {
        await seedUser(1);
        await seedUser(2);
        await seedItem(1);
        await seedInventory(1, 1, 10);
        await seedInventory(2, 1, 5);
    });

    it("rejects a self-trade", async () => {
        await expect(
            createTrade({
                fromUserId: 1,
                toUserId: 1,
                offered: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 1 }] },
                requested: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 1 }] },
            })
        ).rejects.toThrow();
    });

    it("rejects when recipient does not exist", async () => {
        await expect(
            createTrade({
                fromUserId: 1,
                toUserId: 999,
                offered: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 1 }] },
                requested: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 1 }] },
            })
        ).rejects.toThrow();
    });

    it("rejects inventory side with digipogs field", async () => {
        await expect(
            createTrade({
                fromUserId: 1,
                toUserId: 2,
                offered: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 1 }], digipogs: 5 },
                requested: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 1 }] },
            })
        ).rejects.toThrow();
    });

    it("rejects pool side with items field", async () => {
        await seedPool(1, 100);
        await seedPoolOwner(1, 1);

        await expect(
            createTrade({
                fromUserId: 1,
                toUserId: 2,
                offered: { source: { type: "pool", poolId: 1 }, digipogs: 10, items: [{ itemId: 1, quantity: 1 }] },
                requested: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 1 }] },
            })
        ).rejects.toThrow();
    });

    it("rejects pool side when pool is not owned by the requester", async () => {
        await seedPool(1, 100);
        await seedPoolOwner(1, 2); // pool owned by user 2, not user 1

        await expect(
            createTrade({
                fromUserId: 1,
                toUserId: 2,
                offered: { source: { type: "pool", poolId: 1 }, digipogs: 10 },
                requested: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 1 }] },
            })
        ).rejects.toThrow();
    });

    it("rejects requested pool side when pool is not owned by the recipient", async () => {
        await seedPool(1, 100);
        await seedPoolOwner(1, 1); // pool owned by user 1, not user 2

        await expect(
            createTrade({
                fromUserId: 1,
                toUserId: 2,
                offered: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 1 }] },
                requested: { source: { type: "pool", poolId: 1 }, digipogs: 10 },
            })
        ).rejects.toThrow();
    });

    it("rejects when requester has insufficient inventory at create time", async () => {
        await expect(
            createTrade({
                fromUserId: 1,
                toUserId: 2,
                offered: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 999 }] },
                requested: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 1 }] },
            })
        ).rejects.toThrow();
    });

    it("rejects when pool has insufficient balance at create time", async () => {
        await seedPool(1, 5);
        await seedPoolOwner(1, 1);

        await expect(
            createTrade({
                fromUserId: 1,
                toUserId: 2,
                offered: { source: { type: "pool", poolId: 1 }, digipogs: 100 },
                requested: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 1 }] },
            })
        ).rejects.toThrow();
    });

    it("creates a trade and returns tradeId", async () => {
        const { tradeId } = await createTrade({
            fromUserId: 1,
            toUserId: 2,
            offered: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 2 }] },
            requested: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 1 }] },
        });
        expect(typeof tradeId).toBe("number");
        expect(tradeId).toBeGreaterThan(0);
    });

    it("creates a trade with multiple distinct item IDs on an inventory side", async () => {
        await seedItem(2);
        await seedInventory(1, 2, 4);
        await seedInventory(2, 2, 4);

        const { tradeId } = await createTrade({
            fromUserId: 1,
            toUserId: 2,
            offered: {
                source: { type: "inventory" },
                items: [
                    { itemId: 1, quantity: 2 },
                    { itemId: 2, quantity: 3 },
                ],
            },
            requested: { source: { type: "inventory" }, items: [{ itemId: 2, quantity: 1 }] },
        });

        const trade = await mockDatabase.dbGet("SELECT offer FROM exchanges WHERE id = ?", [tradeId]);
        expect(JSON.parse(trade.offer)).toEqual(expect.objectContaining({1: 2, 2: 3}));
    });

    it("notifies the recipient on create", async () => {
        const { tradeId } = await createTrade({
            fromUserId: 1,
            toUserId: 2,
            offered: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 1 }] },
            requested: { source: { type: "inventory" }, items: [{ itemId: 1, quantity: 1 }] },
        });

        const notifications = await mockDatabase.dbGetAll("SELECT * FROM notifications WHERE user_id = ? AND type = 'trade_received'", [2]);
        expect(notifications).toHaveLength(1);
        const data = JSON.parse(notifications[0].data);
        expect(data.tradeId).toBe(tradeId);
    });
});

describe("getTradesForUser()", () => {
    beforeEach(async () => {
        await seedUser(1);
        await seedUser(2);
        await mockDatabase.dbRun("DELETE FROM exchanges");
    });

    it("returns empty buckets when user has no trades", async () => {
        const result = await getTradesForUser(1);
        expect(result.inbound.items).toHaveLength(0);
        expect(result.outbound.items).toHaveLength(0);
        expect(result.completed.items).toHaveLength(0);
        expect(result.inactive.items).toHaveLength(0);
    });

    it("puts pending trade where user is recipient into inbound", async () => {
        await seedTrade({
            fromUser: 2,
            toUser: 1,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
            status: "pending",
        });
        const result = await getTradesForUser(1);
        expect(result.inbound.total).toBe(1);
        expect(result.outbound.total).toBe(0);
    });

    it("puts pending trade where user is requester into outbound", async () => {
        await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
            status: "pending",
        });
        const result = await getTradesForUser(1);
        expect(result.outbound.total).toBe(1);
        expect(result.inbound.total).toBe(0);
    });

    it("puts completed trades into completed bucket", async () => {
        await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [{"itemId": 1, "quantity": 2}],
            status: "completed",
        });
        const result = await getTradesForUser(1);
        expect(result.completed.total).toBe(1);
    });

    it("puts rejected/canceled/failed trades into inactive bucket", async () => {
        await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
            status: "rejected",
        });
        await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
            status: "canceled",
        });
        await seedTrade({
            fromUser: 2,
            toUser: 1,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
            status: "failed",
        });
        const result = await getTradesForUser(1);
        expect(result.inactive.total).toBe(3);
    });

    it("includes standardized hasMore pagination metadata for each bucket", async () => {
        await seedTrade({
            fromUser: 2,
            toUser: 1,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
            status: "pending",
        });
        await seedTrade({
            fromUser: 2,
            toUser: 1,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
            status: "pending",
        });

        const result = await getTradesForUser(1, { limit: 1, offset: 0 });

        expect(result.inbound).toMatchObject({
            total: 2,
            limit: 1,
            offset: 0,
            hasMore: true,
        });
        expect(result.outbound.hasMore).toBe(false);
    });
});

describe("getTradeById()", () => {
    beforeEach(async () => {
        await seedUser(1);
        await seedUser(2);
        await seedUser(3);
    });

    it("returns null for a non-participant", async () => {
        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
        });
        const result = await getTradeById(id, 3);
        expect(result).toBeNull();
    });

    it("returns null for a nonexistent trade", async () => {
        const result = await getTradeById(9999, 1);
        expect(result).toBeNull();
    });

    it("returns the trade for the requester", async () => {
        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [{ itemId: 1, quantity: 1 }],
            requestedItems: [],
        });
        const result = await getTradeById(id, 1);
        expect(result).not.toBeNull();
        expect(result.id).toBe(id);
        expect(result.fromUserId).toBe(1);
    });

    it("returns the trade for the recipient", async () => {
        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
        });
        const result = await getTradeById(id, 2);
        expect(result).not.toBeNull();
    });
});

describe("acceptTrade()", () => {
    beforeEach(async () => {
        await seedUser(1);
        await seedUser(2);
        await seedItem(1, "Sword", 100);
        await seedItem(2, "Shield", 100);
    });

    it("throws when the acceptor is not the recipient", async () => {
        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [{ itemId: 1, quantity: 1 }],
            requestedItems: [{ itemId: 2, quantity: 1 }],
        });
        await expect(acceptTrade(id, 1)).rejects.toThrow(); // user 1 is requester, not recipient
    });

    it("throws when trade is not pending", async () => {
        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [{ itemId: 1, quantity: 1 }],
            requestedItems: [{ itemId: 2, quantity: 1 }],
            status: "rejected",
        });
        await expect(acceptTrade(id, 2)).rejects.toThrow();
    });

    it("throws for a non-participant", async () => {
        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
        });
        await seedUser(3);
        await expect(acceptTrade(id, 3)).rejects.toThrow();
    });

    it("exchanges items between users on item-for-item accept", async () => {
        await seedInventory(1, 1, 5); // user 1 has 5 Swords
        await seedInventory(2, 2, 3); // user 2 has 3 Shields

        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [{ itemId: 1, quantity: 2 }],
            requestedItems: [{ itemId: 2, quantity: 1 }],
        });

        const result = await acceptTrade(id, 2);
        expect(result.success).toBe(true);

        // User 1 now has 3 Swords and 1 Shield
        const u1sword = await mockDatabase.dbGet("SELECT COALESCE(SUM(quantity),0) AS total FROM inventory WHERE user_id=1 AND item_id=1");
        const u1shield = await mockDatabase.dbGet("SELECT COALESCE(SUM(quantity),0) AS total FROM inventory WHERE user_id=1 AND item_id=2");
        expect(u1sword.total).toBe(3);
        expect(u1shield.total).toBe(1);

        // User 2 now has 2 Swords and 2 Shields
        const u2sword = await mockDatabase.dbGet("SELECT COALESCE(SUM(quantity),0) AS total FROM inventory WHERE user_id=2 AND item_id=1");
        const u2shield = await mockDatabase.dbGet("SELECT COALESCE(SUM(quantity),0) AS total FROM inventory WHERE user_id=2 AND item_id=2");
        expect(u2sword.total).toBe(2);
        expect(u2shield.total).toBe(2);
    });

    it("updates trade status to completed", async () => {
        await seedInventory(1, 1, 5);
        await seedInventory(2, 2, 3);

        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [{ itemId: 1, quantity: 1 }],
            requestedItems: [{ itemId: 2, quantity: 1 }],
        });

        await acceptTrade(id, 2);
        const trade = await mockDatabase.dbGet("SELECT status FROM exchanges WHERE id = ?", [id]);
        expect(trade.status).toBe("completed");
    });

    it("notifies both participants on successful accept", async () => {
        await seedInventory(1, 1, 2);
        await seedInventory(2, 2, 2);

        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [{ itemId: 1, quantity: 1 }],
            requestedItems: [{ itemId: 2, quantity: 1 }],
        });

        await acceptTrade(id, 2);

        const [n1, n2] = await Promise.all([
            mockDatabase.dbGet("SELECT 1 FROM notifications WHERE user_id=1 AND type='trade_completed'"),
            mockDatabase.dbGet("SELECT 1 FROM notifications WHERE user_id=2 AND type='trade_completed'"),
        ]);
        expect(n1).toBeTruthy();
        expect(n2).toBeTruthy();
    });

    it("marks trade as failed when requester inventory is stale, makes no asset movements", async () => {
        // Trade created when user 1 had items, but inventory removed before accept.
        await seedInventory(2, 2, 3);

        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [{ itemId: 1, quantity: 5 }], // user 1 has none
            requestedItems: [{ itemId: 2, quantity: 1 }],
        });

        const result = await acceptTrade(id, 2);
        expect(result.success).toBe(false);

        const trade = await mockDatabase.dbGet("SELECT status FROM exchanges WHERE id = ?", [id]);
        expect(trade.status).toBe("failed");

        // User 2's inventory must be unchanged
        const u2shield = await mockDatabase.dbGet("SELECT COALESCE(SUM(quantity),0) AS total FROM inventory WHERE user_id=2 AND item_id=2");
        expect(u2shield.total).toBe(3);
    });

    it("marks trade as failed when recipient inventory is stale", async () => {
        await seedInventory(1, 1, 5);
        // User 2 has no Shields, but trade requests 1

        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [{ itemId: 1, quantity: 2 }],
            requestedItems: [{ itemId: 2, quantity: 1 }], // user 2 has none
        });

        const result = await acceptTrade(id, 2);
        expect(result.success).toBe(false);

        // User 1's inventory must be unchanged
        const u1sword = await mockDatabase.dbGet("SELECT COALESCE(SUM(quantity),0) AS total FROM inventory WHERE user_id=1 AND item_id=1");
        expect(u1sword.total).toBe(5);
    });

    it("marks trade as failed when requester no longer owns the offered pool", async () => {
        await seedPool(1, 100);
        await seedPoolOwner(1, 1);
        await seedInventory(2, 2, 3);

        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "pool",
            fromPoolId: 1,
            toSourceType: "inventory",
            offeredDigipogs: 50,
            requestedItems: [{ itemId: 2, quantity: 1 }],
        });

        await mockDatabase.dbRun("DELETE FROM digipog_pool_users WHERE pool_id = ? AND user_id = ?", [1, 1]);

        const result = await acceptTrade(id, 2);
        expect(result.success).toBe(false);
        expect(result.reason).toBe("Requester is no longer a top holder.");

        const trade = await mockDatabase.dbGet("SELECT status FROM exchanges WHERE id = ?", [id]);
        const pool = await mockDatabase.dbGet("SELECT amount FROM digipog_pools WHERE id = 1");
        const u2shield = await mockDatabase.dbGet("SELECT COALESCE(SUM(quantity),0) AS total FROM inventory WHERE user_id=2 AND item_id=2");
        expect(trade.status).toBe("failed");
        expect(pool.amount).toBe(100);
        expect(u2shield.total).toBe(3);
    });

    it("marks trade as failed when recipient no longer owns the requested pool", async () => {
        await seedPool(2, 80);
        await seedPoolOwner(2, 2);
        await seedInventory(1, 1, 4);

        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "pool",
            toPoolId: 2,
            offeredItems: [{ itemId: 1, quantity: 2 }],
            requestedDigipogs: 40,
        });

        await mockDatabase.dbRun("DELETE FROM digipog_pool_users WHERE pool_id = ? AND user_id = ?", [2, 2]);

        const result = await acceptTrade(id, 2);
        expect(result.success).toBe(false);
        expect(result.reason).toBe("Recipient is no longer a top holder.");

        const trade = await mockDatabase.dbGet("SELECT status FROM exchanges WHERE id = ?", [id]);
        const pool = await mockDatabase.dbGet("SELECT amount FROM digipog_pools WHERE id = 2");
        const u1sword = await mockDatabase.dbGet("SELECT COALESCE(SUM(quantity),0) AS total FROM inventory WHERE user_id=1 AND item_id=1");
        expect(trade.status).toBe("failed");
        expect(pool.amount).toBe(80);
        expect(u1sword.total).toBe(4);
    });

    it("notifies both participants when trade fails", async () => {
        // No inventory seeded - trade will fail
        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [{ itemId: 1, quantity: 5 }],
            requestedItems: [{ itemId: 2, quantity: 1 }],
        });

        await acceptTrade(id, 2);

        const n1 = await mockDatabase.dbGet("SELECT 1 FROM notifications WHERE user_id=1 AND type='trade_failed'");
        const n2 = await mockDatabase.dbGet("SELECT 1 FROM notifications WHERE user_id=2 AND type='trade_failed'");
        expect(n1).toBeTruthy();
        expect(n2).toBeTruthy();
    });

    it("exchanges pool digipogs for inventory items with tax applied", async () => {
        await seedPool(0, 0); // developer pool
        await seedPool(1, 200); // user 1's pool
        await seedPoolOwner(1, 1);
        await seedInventory(2, 2, 5); // user 2 has 5 Shields

        const offeredDigipogs = 100;
        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "pool",
            fromPoolId: 1,
            toSourceType: "inventory",
            offeredDigipogs,
            requestedItems: [{ itemId: 2, quantity: 2 }],
        });

        const result = await acceptTrade(id, 2);
        expect(result.success).toBe(true);

        // Pool 1 debited by full amount
        const pool1 = await mockDatabase.dbGet("SELECT amount FROM digipog_pools WHERE id=1");
        expect(pool1.amount).toBe(100); // 200 - 100

        // User 2 receives taxed amount to user balance (inventory source)
        const taxedAmount = Math.floor(offeredDigipogs * 0.9) > 1 ? Math.floor(offeredDigipogs * 0.9) : 1;
        const taxAmount = offeredDigipogs - taxedAmount;
        const u2 = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id=2");
        expect(u2.digipogs).toBe(taxedAmount);

        // Dev pool receives tax
        const devPool = await mockDatabase.dbGet("SELECT amount FROM digipog_pools WHERE id=0");
        expect(devPool.amount).toBe(taxAmount);

        // User 1 receives the requested items
        const u1shields = await mockDatabase.dbGet("SELECT COALESCE(SUM(quantity),0) AS total FROM inventory WHERE user_id=1 AND item_id=2");
        expect(u1shields.total).toBe(2);
    });
});

describe("rejectTrade()", () => {
    beforeEach(async () => {
        await seedUser(1);
        await seedUser(2);
    });

    it("throws when the rejector is not the recipient", async () => {
        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
        });
        await expect(rejectTrade(id, 1)).rejects.toThrow();
    });

    it("throws when trade is not pending", async () => {
        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
            status: "completed",
        });
        await expect(rejectTrade(id, 2)).rejects.toThrow();
    });

    it("sets status to rejected and notifies requester", async () => {
        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
        });
        await rejectTrade(id, 2);

        const trade = await mockDatabase.dbGet("SELECT status FROM exchanges WHERE id=?", [id]);
        expect(trade.status).toBe("rejected");

        const notif = await mockDatabase.dbGet("SELECT 1 FROM notifications WHERE user_id=1 AND type='trade_rejected'");
        expect(notif).toBeTruthy();
    });
});

describe("cancelTrade()", () => {
    beforeEach(async () => {
        await seedUser(1);
        await seedUser(2);
    });

    it("throws when the canceler is not the requester", async () => {
        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
        });
        await expect(cancelTrade(id, 2)).rejects.toThrow();
    });

    it("throws when trade is not pending", async () => {
        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
            status: "rejected",
        });
        await expect(cancelTrade(id, 1)).rejects.toThrow();
    });

    it("sets status to canceled and notifies recipient", async () => {
        const id = await seedTrade({
            fromUser: 1,
            toUser: 2,
            fromSourceType: "inventory",
            toSourceType: "inventory",
            offeredItems: [],
            requestedItems: [],
        });
        await cancelTrade(id, 1);

        const trade = await mockDatabase.dbGet("SELECT status FROM exchanges WHERE id=?", [id]);
        expect(trade.status).toBe("canceled");

        const notif = await mockDatabase.dbGet("SELECT 1 FROM notifications WHERE user_id=2 AND type='trade_canceled'");
        expect(notif).toBeTruthy();
    });
});
