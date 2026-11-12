const bcrypt = require("bcrypt");
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

const {
    createExchange,
    acceptExchange,
    getExchangeById,
    getExchangesForUser,
    cancelExchange,
    rejectExchange,
} = require("@services/exchange-service");

const PIN = "1234";

async function seedUser(id, digipogs = 0, pin = PIN) {
    const hashedPin = await bcrypt.hash(pin, 4);
    await mockDatabase.dbRun(
        "INSERT INTO users (id, email, password, API, secret, digipogs, pin, verified) VALUES (?, ?, 'pw', ?, ?, ?, ?, 1)",
        [id, `user${id}@example.com`, `api${id}`, `secret${id}`, digipogs, hashedPin]
    );
}

async function seedItem(id, name = `Item ${id}`, stackSize = 100) {
    await mockDatabase.dbRun("INSERT INTO item_registry (id, name, description, stack_size) VALUES (?, ?, 'desc', ?)", [id, name, stackSize]);
}

async function seedInventory(userId, itemId, quantity) {
    await mockDatabase.dbRun("INSERT INTO inventory (user_id, item_id, quantity) VALUES (?, ?, ?)", [userId, itemId, quantity]);
}

async function inventoryTotal(userId, itemId) {
    const row = await mockDatabase.dbGet("SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory WHERE user_id = ? AND item_id = ?", [userId, itemId]);
    return row.total;
}

async function userBalance(userId) {
    const row = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [userId]);
    return row.digipogs;
}

async function seedExchange(opts) {
    opts = {
        fromUser: 1,
        toUser: 2,
        offer: {},
        request: {},
        status: "pending",
        fromType: "user",
        toType: "user",
        fromId: null,
        toId: null,
        ...opts
    }
    
    const now = new Date().toISOString();
    return mockDatabase.dbRun(
        `INSERT INTO exchanges
            (from_user_id, from_id, from_type, offer, to_user_id, to_id, to_type,
             request, reason, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'test', ?, ?, ?)`,
        [opts.fromUser, opts.fromId, opts.fromType, JSON.stringify(opts.offer), opts.toUser, opts.toId, opts.toType, JSON.stringify(opts.request), opts.status, now, now]
    );
}

async function notificationsFor(userId, type) {
    return mockDatabase.dbGetAll("SELECT * FROM notifications WHERE user_id = ? AND type = ?", [userId, type]);
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

describe("createExchange()", () => {
    beforeEach(async () => {
        await seedUser(1, 100);
        await seedUser(2, 100);
        await seedItem(1);
        await seedInventory(1, 1, 5);
    });

    it("rejects self exchanges", async () => {
        await expect(
            createExchange({
                from: { id: 1, type: "user", pin: PIN, offer: { 1: 1 } },
                to: { id: 1, type: "user", request: {} },
            })
        ).rejects.toThrow();
    });

    it("rejects malformed parties and payloads", async () => {
        const cases = [
            { from: null, to: { id: 2, type: "user", request: {} } },
            { from: { id: 1, type: "account", pin: PIN, offer: { 1: 1 } }, to: { id: 2, type: "user", request: {} } },
            { from: { id: 1, type: "user", pin: PIN, offer: {} }, to: { id: 2, type: "user", request: {} } },
            { from: { id: 1, type: "user", pin: PIN, offer: { abc: 1 } }, to: { id: 2, type: "user", request: {} } },
            { from: { id: 1, type: "user", pin: PIN, offer: { 1: 0 } }, to: { id: 2, type: "user", request: {} } },
            { from: { id: 1, type: "user", pin: PIN, offer: { 999: 1 } }, to: { id: 2, type: "user", request: {} } },
        ];

        for (const exchange of cases) {
            await expect(createExchange(exchange)).rejects.toThrow();
        }
    });

    it("creates a pending exchange and notifies the recipient", async () => {
        const exchange = {
            from: { id: 1, type: "user", pin: PIN, offer: { 1: 2 } },
            to: { id: 2, type: "user", request: { 0: 10 } },
        };

        const exchangeId = (await createExchange(exchange)).exchangeId;
        const row = await mockDatabase.dbGet("SELECT * FROM exchanges WHERE id = ?", [exchangeId]);
        const notifications = await notificationsFor(2, "exchange_received");

        expect(row.status).toBe("pending");
        expect(JSON.parse(row.offer)).toEqual(exchange.from.offer);
        expect(JSON.parse(row.request)).toEqual(exchange.to.request);
        expect(notifications).toHaveLength(1);
        expect(JSON.parse(notifications[0].data)).toEqual({ exchangeId, fromUserId: 1 });
    });

    it("completes an item transaction and moves the offered inventory", async () => {
        const result = await createExchange({
            from: { id: 1, type: "user", pin: PIN, offer: { 1: 2 } },
            to: { id: 2, type: "user", request: {} },
        });

        expect(result.exchangeId).toBeDefined();
        expect(await inventoryTotal(1, 1)).toBe(3);
        expect(await inventoryTotal(2, 1)).toBe(2);
        const row = await mockDatabase.dbGet("SELECT status FROM exchanges WHERE id = ?", [result.exchangeId]);
        expect(row.status).toBe("completed");
    });

    it("completes a digipog transaction and moves the balance", async () => {
        const result = await createExchange({
            from: { id: 1, type: "user", pin: PIN, offer: { 0: 25 } },
            to: { id: 2, type: "user", request: {} },
        });

        expect(await userBalance(1)).toBe(75);
        expect(await userBalance(2)).toBe(122);
        expect(result.exchangeId).toBeDefined();
    });
});

describe("acceptExchange()", () => {
    beforeEach(async () => {
        await seedUser(1, 100);
        await seedUser(2, 100);
        await seedItem(1);
        await seedItem(2);
        await seedInventory(1, 1, 5);
        await seedInventory(2, 2, 4);
    });

    it("rejects missing, completed, and incorrectly authorized exchanges", async () => {
        await expect(acceptExchange(999, PIN)).rejects.toThrow();

        const completedId = await seedExchange({ status: "completed" });
        await expect(acceptExchange(completedId, PIN)).rejects.toThrow();

        const pendingId = await seedExchange();
        await expect(acceptExchange(pendingId, "wrong")).rejects.toThrow();
    });

    it("accepts an item exchange, moves both sides, and notifies both participants", async () => {
        const exchangeId = await seedExchange({
            offer: { 1: 2 },
            request: { 2: 3 },
        });

        const result = await acceptExchange(exchangeId, PIN);
        const row = await mockDatabase.dbGet("SELECT status FROM exchanges WHERE id = ?", [exchangeId]);

        expect(result).toEqual({ success: true });
        expect(row.status).toBe("completed");
        expect(await inventoryTotal(1, 1)).toBe(3);
        expect(await inventoryTotal(2, 1)).toBe(2);
        expect(await inventoryTotal(2, 2)).toBe(1);
        expect(await inventoryTotal(1, 2)).toBe(3);
        expect(await notificationsFor(1, "exchange_completed")).toHaveLength(1);
        expect(await notificationsFor(2, "exchange_completed")).toHaveLength(1);
    });

    it("accepts a digipog exchange and moves both balances", async () => {
        const exchangeId = await seedExchange({
            offer: { 0: 25 },
            request: { 0: 10 },
        });

        await acceptExchange(exchangeId, PIN);

        expect(await userBalance(1)).toBe(84);
        expect(await userBalance(2)).toBe(112);
        expect(await notificationsFor(1, "exchange_completed")).toHaveLength(1);
        expect(await notificationsFor(2, "exchange_completed")).toHaveLength(1);
    });

    it("fails without transferring resources when the creator lacks funds", async () => {
        await mockDatabase.dbRun("UPDATE users SET digipogs = 5 WHERE id = 1");
        const exchangeId = await seedExchange({ offer: { 0: 25 }, request: { 0: 10 } });

        await expect(acceptExchange(exchangeId, PIN)).rejects.toThrow();

        const row = await mockDatabase.dbGet("SELECT status FROM exchanges WHERE id = ?", [exchangeId]);
        expect(row.status).toBe("failed");
        expect(await userBalance(1)).toBe(5);
        expect(await userBalance(2)).toBe(100);
        expect(await notificationsFor(1, "exchange_failed")).toHaveLength(1);
        expect(await notificationsFor(2, "exchange_failed")).toHaveLength(1);
    });

    it("fails without transferring resources when an item is unavailable", async () => {
        const exchangeId = await seedExchange({ offer: { 1: 20 }, request: { 2: 1 } });

        await expect(acceptExchange(exchangeId, PIN)).rejects.toThrow();

        const row = await mockDatabase.dbGet("SELECT status FROM exchanges WHERE id = ?", [exchangeId]);
        expect(row.status).toBe("failed");
        expect(await inventoryTotal(1, 1)).toBe(5);
        expect(await inventoryTotal(2, 2)).toBe(4);
        expect(await notificationsFor(1, "exchange_failed")).toHaveLength(1);
        expect(await notificationsFor(2, "exchange_failed")).toHaveLength(1);
    });
});

describe("getExchangeById()", () => {
    beforeEach(async () => {
        await seedUser(1);
        await seedUser(2);
        await seedUser(3);
    });

    it("returns null for missing and unrelated exchanges", async () => {
        expect(await getExchangeById(999, 1)).toBeNull();

        const exchangeId = await seedExchange({ fromUser: 1, toUser: 2, offer: { 1: 2 }, request: { 0: 5 } });
        expect(await getExchangeById(exchangeId, 3)).toBeNull();
    });

    it("returns the formatted exchange to either participant", async () => {
        const exchangeId = await seedExchange({ offer: { 1: 2 }, request: { 0: 5 }, status: "pending" });

        const exchange = await getExchangeById(exchangeId, 1);

        expect(exchange).toEqual(
            expect.objectContaining({
                id: exchangeId,
                from: { id: 1, type: "user", offer: { 1: 2 } },
                to: { id: 2, type: "user", request: { 0: 5 } },
                status: "pending",
            })
        );
        expect(await getExchangeById(exchangeId, 2)).toEqual(exchange);
    });
});

describe("getExchangesForUser()", () => {
    beforeEach(async () => {
        await mockDatabase.dbRun("DELETE FROM exchanges");
        await seedUser(1);
        await seedUser(2);
        await seedUser(3);
    });

    it("returns an empty paginated result when no exchange is visible", async () => {
        const result = await getExchangesForUser(1);

        expect(result).toEqual({
            success: true,
            data: { exchanges: [] },
            pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
        });
    });

    it("includes only inbound and outbound exchanges by default", async () => {
        await seedExchange({ fromUser: 1, toUser: 2, offer: { 1: 1 } });
        await seedExchange({ fromUser: 2, toUser: 1, offer: { 1: 1 } });
        await seedExchange({ fromUser: 2, toUser: 3, offer: { 1: 1 } });

        const result = await getExchangesForUser(1);

        expect(result.pagination.total).toBe(2);
        expect(result.data.exchanges).toHaveLength(2);
    });

    it("filters by inbound and outbound separately when explicitly passed", async () => {
        await seedExchange({ fromUser: 1, toUser: 2, offer: { 67: 67 } });
        await seedExchange({ fromUser: 2, toUser: 1, offer: { 39: 39 } });

        const defaultResult = await getExchangesForUser(1);
        const inboundResult = await getExchangesForUser(1, { filters: ["inbound"] });
        const outboundResult = await getExchangesForUser(1, { filters: ["outbound"] });

        expect(defaultResult.data.exchanges).toHaveLength(2);
        expect(inboundResult.data.exchanges).toHaveLength(1);
        expect(inboundResult.data.exchanges[0].from.offer["39"]).toBe(39)
        expect(outboundResult.data.exchanges).toHaveLength(1);
        expect(outboundResult.data.exchanges[0].from.offer["67"]).toBe(67)
    });
    
    it("filters by trade, transaction, and status", async () => {
        await seedExchange({ fromUser: 1, toUser: 2, offer: { 1: 1 }, request: { 0: 5 }, status: "pending" });
        await seedExchange({ fromUser: 1, toUser: 2, offer: { 0: 5 }, request: {}, status: "completed" });
        await seedExchange({ fromUser: 1, toUser: 2, offer: { 0: 5 }, request: {}, status: "canceled" });
        await seedExchange({ fromUser: 1, toUser: 2, offer: { 0: 5 }, request: {}, status: "rejected" });

        const tradeResult = await getExchangesForUser(1, { filters: ["trade"] });
        const transactionResult = await getExchangesForUser(1, { filters: ["transaction"] });
        const inactiveResult = await getExchangesForUser(1, { filters: ["inactive"] });
        const rejectedResult = await getExchangesForUser(1, { filters: ["rejected"] });

        expect(tradeResult.data.exchanges).toHaveLength(1);
        expect(transactionResult.data.exchanges).toHaveLength(3);
        expect(inactiveResult.data.exchanges).toHaveLength(2);
        expect(inactiveResult.data.exchanges[0].status).toBe("canceled");
        expect(rejectedResult.data.exchanges[0].status).toBe("rejected");
    });

    it("applies pagination after filtering", async () => {
        await seedExchange({ fromUser: 1, toUser: 2, offer: { 0: 1 }, status: "completed" });
        await seedExchange({ fromUser: 1, toUser: 2, offer: { 0: 2 }, status: "completed" });
        await seedExchange({ fromUser: 1, toUser: 2, offer: { 0: 3 }, status: "completed" });

        const result = await getExchangesForUser(1, { limit: 2, offset: 1, filters: ["completed"] });

        expect(result.data.exchanges).toHaveLength(2);
        expect(result.pagination).toEqual({ total: 3, limit: 2, offset: 1, hasMore: true });
    });
});

describe("cancelExchange()", () => {
    beforeEach(async () => {
        await seedUser(1);
        await seedUser(2);
    });

    it("rejects missing, non-pending, and incorrectly authorized exchanges", async () => {
        await expect(cancelExchange(999, PIN)).rejects.toThrow();

        const completedId = await seedExchange({ status: "completed" });
        await expect(cancelExchange(completedId, PIN)).rejects.toThrow();

        const pendingId = await seedExchange();
        await expect(cancelExchange(pendingId, "wrong")).rejects.toThrow();
    });

    it("cancels a pending exchange and notifies the creator", async () => {
        const exchangeId = await seedExchange();

        await cancelExchange(exchangeId, PIN);

        const row = await mockDatabase.dbGet("SELECT status FROM exchanges WHERE id = ?", [exchangeId]);
        expect(row.status).toBe("canceled");
        expect(await notificationsFor(1, "exchange_canceled")).toHaveLength(1);
    });
});

describe("rejectExchange()", () => {
    beforeEach(async () => {
        await seedUser(1);
        await seedUser(2);
    });

    it("rejects missing, non-pending, and incorrectly authorized exchanges", async () => {
        await expect(rejectExchange(999, PIN)).rejects.toThrow();

        const completedId = await seedExchange({ status: "completed" });
        await expect(rejectExchange(completedId, PIN)).rejects.toThrow();

        const pendingId = await seedExchange();
        await expect(rejectExchange(pendingId, "wrong")).rejects.toThrow();
    });

    it("rejects a pending exchange and notifies the recipient", async () => {
        const exchangeId = await seedExchange();

        await rejectExchange(exchangeId, PIN);

        const row = await mockDatabase.dbGet("SELECT status FROM exchanges WHERE id = ?", [exchangeId]);
        expect(row.status).toBe("rejected");
        expect(await notificationsFor(2, "exchange_rejected")).toHaveLength(1);
    });
});
