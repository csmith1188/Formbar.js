const { createTestDb } = require("@test-helpers/db");
const { setGlobalPermissionLevel } = require("@test-helpers/role-seeding");
const bcrypt = require("bcrypt");

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

jest.mock("@modules/config", () => ({
    settings: { emailEnabled: false },
    frontendUrl: "http://localhost:3000",
    digipogRateLimit: {
        maxAttempts: 5,
        lockoutDuration: 900000,
        minDelayBetweenAttempts: 1000,
        attemptWindow: 300000,
    },
}));

jest.mock("@services/classroom-service", () => ({
    getClassIDFromCode: jest.fn(),
    classStateStore: {
        getClassroom: jest.fn(),
        getUser: jest.fn(),
    },
}));

const {
    createPool,
    deletePool,
    getPoolById,
    getPoolsForUser,
    getPoolsForUserPaginated,
    getUsersForPool,
    isUserInPool,
    isPoolUserTopHolder,
    getTopHoldingPoolsForUser,
    poolTopHolderCheck,
    updatePoolPin,
    verifyPoolPin,
    removeUserFromPool,
    payoutPool,
    getUserTransactions,
    getUserTransactionsPaginated,
    awardDigipogs,
    transferDigipogs,
} = require("@services/digipog-service");
const { addItemToInventory } = require("@services/inventory-service");

// Global counter never resets so each user gets a unique ID across all tests,
// preventing rate limiter key collisions between tests.
let userIdCounter = 1000;

async function seedUser(overrides = {}) {
    userIdCounter++;
    const uid = userIdCounter;
    const defaults = {
        email: `user${uid}@test.com`,
        password: "hashed",
        permissions: 2,
        API: `api-${uid}-${Math.random()}`,
        secret: `secret-${uid}-${Math.random()}`,
        displayName: `User${uid}`,
        digipogs: 100,
        pin: null,
        verified: 0,
    };
    const u = { ...defaults, ...overrides };
    await mockDatabase.dbRun(
        "INSERT INTO users (id, email, password, API, secret, displayName, digipogs, pin, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [uid, u.email, u.password, u.API, u.secret, u.displayName, u.digipogs, u.pin, u.verified]
    );
    await setGlobalPermissionLevel(mockDatabase, uid, u.permissions);
    return { id: uid, ...u };
}

async function seedPool(name = "Test Pool", amount = 0) {
    const id = await mockDatabase.dbRun("INSERT INTO digipog_pools (name, description, amount) VALUES (?, ?, ?)", [name, "desc", amount]);
    return { id, name, amount };
}

async function seedTransaction(from_user_id, from_id, to_user_id, to_id, from_type, to_type, amount, reason = "test") {
    const now = new Date().toISOString();
    await mockDatabase.dbRun("INSERT INTO exchanges (from_user_id, from_id, from_type, offer, to_user_id, to_id, to_type, request, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, 'completed', ?, ?)", [
        from_user_id,
        from_id,
        from_type,
        JSON.stringify({ 0: amount }),
        to_user_id,
        to_id,
        to_type,
        reason,
        now,
        now
    ]);
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

describe("createPool()", () => {
    it("creates a pool and adds the owner", async () => {
        const user = await seedUser();
        const poolId = await createPool({ name: "My Pool", description: "desc", defaultShareholderId: user.id });

        const pool = await getPoolById(poolId);
        expect(pool.name).toBe("My Pool");
        expect(pool.amount).toBe(0);
        const shareItem = await mockDatabase.dbGet("SELECT name, description, stack_size FROM item_registry WHERE id = ?", [pool.share_item]);
        expect(shareItem).toEqual({ name: "My Pool Share", description: "Share of My Pool", stack_size: 100 });
        const shares = await mockDatabase.dbGet("SELECT quantity FROM inventory WHERE user_id = ? AND item_id = ?", [user.id, pool.share_item]);
        expect(shares.quantity).toBe(100);

        const ownerFlag = await isPoolUserTopHolder(poolId, user.id);
        expect(ownerFlag).toBe(true);
    });

    it("defaults description to empty string", async () => {
        const user = await seedUser();
        const poolId = await createPool({ name: "No Desc", defaultShareholderId: user.id });
        const pool = await getPoolById(poolId);
        expect(pool.description).toBe("");
    });
});

describe("deletePool()", () => {
    it("removes the pool and all pool_users rows", async () => {
        const user = await seedUser();
        const poolId = await createPool({ name: "Gone", defaultShareholderId: user.id });

        await deletePool(poolId);

        expect(await getPoolById(poolId)).toBeUndefined();
        const users = await getUsersForPool(poolId);
        expect(users).toHaveLength(0);
    });
});

describe("getPoolById()", () => {
    it("returns the pool row", async () => {
        const pool = await seedPool("Lookup");
        const row = await getPoolById(pool.id);
        expect(row.name).toBe("Lookup");
    });

    it("returns undefined for non-existent pool", async () => {
        expect(await getPoolById(99999)).toBeUndefined();
    });
});

describe("getPoolsForUser()", () => {
    it("returns pool_id and owner for each membership", async () => {
        const user = await seedUser();
        const poolId = await createPool({ name: "P1", defaultShareholderId: user.id });

        const pools = await getPoolsForUser(user.id);
        expect(pools).toHaveLength(1);
        expect(pools[0]).toEqual({ pool_id: poolId });
    });

    it("returns empty array for user with no pools", async () => {
        const user = await seedUser();
        expect(await getPoolsForUser(user.id)).toHaveLength(0);
    });
});

describe("getPoolsForUserPaginated()", () => {
    it("returns paginated pools with total count", async () => {
        const user = await seedUser();
        await createPool({ name: "A", defaultShareholderId: user.id });
        await createPool({ name: "B", defaultShareholderId: user.id });
        await createPool({ name: "C", defaultShareholderId: user.id });

        const result = await getPoolsForUserPaginated(user.id, 2, 0);
        expect(result.pools).toHaveLength(2);
        expect(result.total).toBe(3);
    });

    it("respects offset", async () => {
        const user = await seedUser();
        await createPool({ name: "A", defaultShareholderId: user.id });
        await createPool({ name: "B", defaultShareholderId: user.id });
        await createPool({ name: "C", defaultShareholderId: user.id });

        const result = await getPoolsForUserPaginated(user.id, 2, 2);
        expect(result.pools).toHaveLength(1);
        expect(result.total).toBe(3);
    });
});

describe("getUsersForPool()", () => {
    it("returns all users in a pool", async () => {
        const owner = await seedUser();
        const member = await seedUser();
        const poolId = await createPool({ name: "Team", defaultShareholderId: owner.id });
        const pool = await getPoolById(poolId);
        await addItemToInventory(member, pool.share_item, 100);

        const users = await getUsersForPool(poolId);
        expect(users).toHaveLength(2);
    });
});

describe("isUserInPool()", () => {
    it("returns true for member", async () => {
        const user = await seedUser();
        const poolId = await createPool({ name: "P", defaultShareholderId: user.id });
        expect(await isUserInPool(user.id, poolId)).toBe(true);
    });

    it("returns false for non-member", async () => {
        const pool = await seedPool();
        const user = await seedUser();
        expect(await isUserInPool(user.id, pool.id)).toBe(false);
    });
});

describe("isPoolUserTopHolder()", () => {
    it("returns true for top holder", async () => {
        const user = await seedUser();
        const poolId = await createPool({ name: "P", defaultShareholderId: user.id });
        expect(await isPoolUserTopHolder(poolId, user.id)).toBe(true);
    });

    it("returns false for non-owner member", async () => {
        const owner = await seedUser();
        const member = await seedUser();
        const poolId = await createPool({ name: "P", defaultShareholderId: owner.id });
        const pool = await getPoolById(poolId);
        await addItemToInventory(member.id, pool.share_item, 1);
        expect(await isPoolUserTopHolder(poolId, member.id)).toBe(false);
    });

    it("returns false for non-member", async () => {
        const pool = await seedPool();
        const user = await seedUser();
        expect(await isPoolUserTopHolder(pool.id, user.id)).toBe(false);
    });
});

describe("poolTopHolderCheck()", () => {
    it("returns true when req.user is top holder", async () => {
        const user = await seedUser();
        const poolId = await createPool({ name: "P", defaultShareholderId: user.id });
        const req = { user: { id: user.id }, params: { id: String(poolId) } };
        expect(await poolTopHolderCheck(req)).toBe(true);
    });

    it("returns false when req.user is not the pool", async () => {
        const owner = await seedUser();
        const other = await seedUser();
        const poolId = await createPool({ name: "P", defaultShareholderId: owner.id });
        const req = { user: { id: other.id }, params: { id: String(poolId) } };
        expect(await poolTopHolderCheck(req)).toBe(false);
    });
});

describe("getTopHoldingPoolsForUser()", () => {
    it("returns only memberships where the user is a top holder", async () => {
        const user = await seedUser();
        const other = await seedUser();
        const topPoolId = await createPool({ name: "Top Pool", defaultShareholderId: other.id });
        const lowerPoolId = await createPool({ name: "Lower Pool", defaultShareholderId: other.id });
        const { share_item: topShareItemId } = await getPoolById(topPoolId);
        await addItemToInventory(user.id, topShareItemId, 105);
        await addItemToInventory(user.id, lowerPoolId, 50);

        expect(await getTopHoldingPoolsForUser(user.id)).toEqual([topPoolId]);
    });
});

describe("updatePoolPin()", () => {
    it("sets a PIN when the pool has no PIN", async () => {
        const owner = await seedUser();
        const poolId = await createPool({ name: "PIN Pool", defaultShareholderId: owner.id });

        await updatePoolPin(poolId, null, "1234");

        await expect(verifyPoolPin(poolId, "1234")).resolves.toBe(true);
    });

    it("requires and verifies the current PIN before replacing it", async () => {
        const owner = await seedUser();
        const poolId = await createPool({ name: "PIN Pool", defaultShareholderId: owner.id });
        await updatePoolPin(poolId, null, "1234");

        await expect(updatePoolPin(poolId, null, "5678")).rejects.toThrow("Missing the current PIN");
        await expect(updatePoolPin(poolId, "0000", "5678")).rejects.toThrow("Current PIN is incorrect.");
        await updatePoolPin(poolId, "1234", "5678");

        await expect(verifyPoolPin(poolId, "5678")).resolves.toBe(true);
    });

    it("throws when the pool does not exist", async () => {
        await expect(updatePoolPin(99999, null, "1234")).rejects.toThrow("pool not found.");
    });
});

describe("verifyPoolPin()", () => {
    it("throws when no PIN is set", async () => {
        const owner = await seedUser();
        const poolId = await createPool({ name: "PIN Pool", defaultShareholderId: owner.id });

        await expect(verifyPoolPin(poolId, "1234")).rejects.toThrow("No PIN is set");
    });

    it("returns true for a matching PIN and rejects an incorrect PIN", async () => {
        const owner = await seedUser();
        const poolId = await createPool({ name: "PIN Pool", defaultShareholderId: owner.id });
        await updatePoolPin(poolId, null, "1234");

        await expect(verifyPoolPin(poolId, "1234")).resolves.toBe(true);
        await expect(verifyPoolPin(poolId, "0000")).rejects.toThrow("PIN is incorrect.");
    });

    it("throws when the pool does not exist", async () => {
        await expect(verifyPoolPin(99999, "1234")).rejects.toThrow("pool not found.");
    });
});

describe("payoutPool()", () => {
    it("distributes pool amount equally among members", async () => {
        const owner = await seedUser({ digipogs: 0 });
        const member = await seedUser({ digipogs: 0 });
        const poolId = await createPool({ name: "P", defaultShareholderId: owner.id });
        const pool = await getPoolById(poolId);
        await addItemToInventory(member.id, pool.share_item, 100)
        
        await mockDatabase.dbRun("UPDATE digipog_pools SET amount = 100 WHERE id = ?", [poolId]);

        const result = await payoutPool({ actingUserId: owner.id, poolId, amount: 100, payoutType: "percent" });
        expect(result).toEqual({ success: true, message: "Pool payout successful." });

        const ownerRow = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [owner.id]);
        const memberRow = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [member.id]);
        expect(ownerRow.digipogs).toBe(50);
        expect(memberRow.digipogs).toBe(50);

        expect(pool.amount).toBe(0);
    });

    it("creates transaction records for each payout", async () => {
        const owner = await seedUser({ digipogs: 0 });
        const poolId = await createPool({ name: "P", defaultShareholderId: owner.id });
        await mockDatabase.dbRun("DELETE FROM exchanges");
        await mockDatabase.dbRun("UPDATE digipog_pools SET amount = 50 WHERE id = ?", [poolId]);

        await payoutPool({ actingUserId: owner.id, poolId, amount: 100, payoutType: "percent" });

        const txns = await mockDatabase.dbGetAll("SELECT * FROM exchanges WHERE from_id = ? AND from_type = 'pool'", [poolId]);
        expect(txns).toHaveLength(1);
        expect(txns[0].to_user_id).toBe(owner.id);
        expect(JSON.parse(txns[0].offer)["0"]).toBe(50);
        expect(txns[0].reason).toBe("Pool Payout");
    });

    it("floors per-member amount for uneven splits", async () => {
        const owner = await seedUser({ digipogs: 0 });
        const m1 = await seedUser({ digipogs: 0 });
        const m2 = await seedUser({ digipogs: 0 });
        const poolId = await createPool({ name: "P", defaultShareholderId: owner.id });
        const pool = await getPoolById(poolId);
        await addItemToInventory(m1.id, pool.share_item, 100);
        await addItemToInventory(m2.id, pool.share_item, 100);
        await mockDatabase.dbRun("UPDATE digipog_pools SET amount = 10 WHERE id = ?", [poolId]);

        await payoutPool({ actingUserId: owner.id, poolId, amount: 100, payoutType: "percent" });

        const ownerRow = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [owner.id]);
        // 10 / 3 = 3 (floored)
        expect(ownerRow.digipogs).toBe(3);
    });

    it("rejects invalid pool ID", async () => {
        const result = await payoutPool({ actingUserId: 1, poolId: -1 });
        expect(result.success).toBe(false);
    });

    it("rejects when acting user is not owner", async () => {
        const owner = await seedUser();
        const other = await seedUser();
        const poolId = await createPool({ name: "P", defaultShareholderId: owner.id });

        const result = await payoutPool({ actingUserId: other.id, poolId });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/do not own/);
    });

    it("rejects when pool is not found", async () => {
        const user = await seedUser();
        const poolId = await createPool({ name: "P", defaultShareholderId: user.id });
        // Delete the pool row but leave pool_users so isPoolFoundedByUser passes
        await mockDatabase.dbRun("DELETE FROM digipog_pools WHERE id = ?", [poolId]);

        const result = await payoutPool({ actingUserId: user.id, poolId });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/not found/);
    });
});

describe("getUserTransactions()", () => {
    it("returns enriched transactions involving the user", async () => {
        const sender = await seedUser();
        const receiver = await seedUser();
        await seedTransaction(sender.id, null, receiver.id, null, "user", "user", 10, "gift");

        const txns = await getUserTransactions(sender.id);

        expect(txns).toHaveLength(1);
        expect(txns[0].amount).toBe(10);
        expect(txns[0].reason).toBe("gift");
        expect(txns[0].from.id).toBe(sender.id);
        expect(txns[0].from.type).toBe("user");
        expect(txns[0].to.id).toBe(receiver.id);
    });

    it("returns transactions where user is the recipient", async () => {
        const sender = await seedUser();
        const receiver = await seedUser();
        await seedTransaction(sender.id, null, receiver.id, null, "user", "user", 5);

        const txns = await getUserTransactions(receiver.id);
        expect(txns).toHaveLength(1);
    });

    it("returns empty array when no transactions exist", async () => {
        const user = await seedUser();
        const txns = await getUserTransactions(user.id);
        expect(txns).toEqual([]);
    });
});

describe("getUserTransactionsPaginated()", () => {
    it("returns paginated transactions with total count", async () => {
        const user = await seedUser();
        const other = await seedUser();
        for (let i = 0; i < 5; i++) {
            await seedTransaction(user.id, null, other.id, null, "user", "user", i + 1, `txn-${i}`);
        }

        const result = await getUserTransactionsPaginated(user.id, 2, 0);
        expect(result.transactions).toHaveLength(2);
        expect(result.total).toBe(5);
    });

    it("enriches pool-type transactions", async () => {
        const user = await seedUser();
        const pool = await seedPool("Enriched Pool", 50);
        await seedTransaction(99999, pool.id, user.id, null, "pool", "user", 25, "payout");

        const result = await getUserTransactionsPaginated(user.id, 10, 0);
        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].from.type).toBe("pool");
        expect(result.transactions[0].from.username).toBe("Enriched Pool");
    });

    it("enriches class-type transactions", async () => {
        const user = await seedUser();
        await mockDatabase.dbRun("INSERT INTO classroom (name, owner, key) VALUES (?, ?, ?)", ["TestClass", user.id, "key123"]);
        const classRow = await mockDatabase.dbGet("SELECT id FROM classroom WHERE name = 'TestClass'");
        await seedTransaction(user.id, null, 99999, classRow.id, "user", "class", 10, "class-award");

        const result = await getUserTransactionsPaginated(user.id, 10, 0);
        expect(result.transactions[0].to.type).toBe("class");
        expect(result.transactions[0].to.username).toBe("TestClass");
    });
});

describe("awardDigipogs()", () => {
    it("awards digipogs to a user (teacher sender)", async () => {
        const teacher = await seedUser({ permissions: 4 });
        const student = await seedUser({ digipogs: 0 });

        // Put them in same class so teacher has permission
        await mockDatabase.dbRun("INSERT INTO classroom (name, owner, key) VALUES (?, ?, ?)", ["C1", teacher.id, "k1"]);
        const classRow = await mockDatabase.dbGet("SELECT id FROM classroom WHERE owner = ?", [teacher.id]);
        await mockDatabase.dbRun("INSERT INTO classusers (classId, studentId, digiPogs) VALUES (?, ?, ?)", [classRow.id, student.id, 0]);

        const result = await awardDigipogs({ to: { id: student.id, type: "user" }, amount: 10, reason: "Good job" }, { id: teacher.id });
        expect(result.success).toBe(true);
        expect(result.message).toMatch(/awarded successfully/);

        const row = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [student.id]);
        expect(row.digipogs).toBe(10);
    });

    it("returns error for missing recipient", async () => {
        const teacher = await seedUser({ permissions: 4 });
        const result = await awardDigipogs({ amount: 10 }, { id: teacher.id });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Missing recipient/);
    });

    it("returns error for invalid recipient type", async () => {
        const teacher = await seedUser({ permissions: 4 });
        const result = await awardDigipogs({ to: { id: 1, type: "invalid" }, amount: 10 }, { id: teacher.id });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Invalid recipient type/);
    });

    it("returns error for amount <= 0", async () => {
        const teacher = await seedUser({ permissions: 4 });
        const result = await awardDigipogs({ to: { id: 1, type: "user" }, amount: 0 }, { id: teacher.id });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/greater than zero/);
    });

    it("allows a teacher to revoke digipogs from a user", async () => {
        const teacher = await seedUser({ permissions: 4 });
        const student = await seedUser({ digipogs: 10 });

        await mockDatabase.dbRun("INSERT INTO classroom (name, owner, key) VALUES (?, ?, ?)", ["RevokeClass", teacher.id, "revoke-key"]);
        const classRow = await mockDatabase.dbGet("SELECT id FROM classroom WHERE owner = ?", [teacher.id]);
        await mockDatabase.dbRun("INSERT INTO classusers (classId, studentId, digiPogs) VALUES (?, ?, ?)", [classRow.id, student.id, 0]);

        const result = await awardDigipogs({ to: { id: student.id, type: "user" }, amount: -3, reason: "Revoked" }, { id: teacher.id });
        expect(result.success).toBe(true);

        const row = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [student.id]);
        expect(row.digipogs).toBe(7);
    });

    it("allows a manager to award a negative amount", async () => {
        const manager = await seedUser({ permissions: 5 });
        const student = await seedUser({ digipogs: 10 });

        const result = await awardDigipogs({ to: { id: student.id, type: "user" }, amount: -4 }, { id: manager.id });
        expect(result.success).toBe(true);

        const row = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [student.id]);
        expect(row.digipogs).toBe(6);
    });

    it("rejects negative awards from non-teachers", async () => {
        const studentSender = await seedUser({ permissions: 2 });
        const recipient = await seedUser({ digipogs: 10 });

        const result = await awardDigipogs({ to: { id: recipient.id, type: "user" }, amount: -1 }, { id: studentSender.id });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Only teachers and managers/);
    });

    it("returns error when sender account not found", async () => {
        const result = await awardDigipogs({ to: { id: 1, type: "user" }, amount: 5 }, { id: 99999 });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Sender account not found/);
    });

    it("awards to a pool when sender has teacher permissions", async () => {
        const teacher = await seedUser({ permissions: 4 });
        const pool = await seedPool("Award Target", 0);

        const result = await awardDigipogs({ to: { id: pool.id, type: "pool" }, amount: 20, reason: "bonus" }, { id: teacher.id });
        expect(result.success).toBe(true);

        const row = await mockDatabase.dbGet("SELECT amount FROM digipog_pools WHERE id = ?", [pool.id]);
        expect(row.amount).toBe(20);
    });

    it("rejects pool award when sender lacks teacher permissions", async () => {
        const student = await seedUser({ permissions: 2 });
        const pool = await seedPool("Blocked", 0);

        const result = await awardDigipogs({ to: { id: pool.id, type: "pool" }, amount: 5 }, { id: student.id });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/permission.*pool/i);
    });

    it("rejects when recipient user not found", async () => {
        const teacher = await seedUser({ permissions: 4 });
        const result = await awardDigipogs({ to: { id: 99999, type: "user" }, amount: 5 }, { id: teacher.id });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Recipient account not found/);
    });

    it("handles missing 'from' user", async () => {
        const result = await awardDigipogs({ to: { id: 1, type: "user" }, amount: 5 }, {});
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Missing required fields/);
    });

    it("awards to class when sender is class owner", async () => {
        const teacher = await seedUser({ permissions: 4, digipogs: 0 });
        const student = await seedUser({ digipogs: 0 });

        await mockDatabase.dbRun("INSERT INTO classroom (name, owner, key) VALUES (?, ?, ?)", ["AwardClass", teacher.id, "kc"]);
        const classRow = await mockDatabase.dbGet("SELECT id FROM classroom WHERE name = 'AwardClass'");
        await mockDatabase.dbRun("INSERT INTO classusers (classId, studentId, digiPogs) VALUES (?, ?, ?)", [classRow.id, student.id, 0]);

        const result = await awardDigipogs({ to: { id: classRow.id, type: "class" }, amount: 7 }, { id: teacher.id });
        expect(result.success).toBe(true);

        const studentRow = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [student.id]);
        expect(studentRow.digipogs).toBe(7);
    });
});

describe("transferDigipogs()", () => {
    let hashedPin;

    beforeAll(async () => {
        const { hashBcrypt } = require("@modules/crypto");
        hashedPin = await hashBcrypt("1234");
    });

    it("transfers between users with 10% tax", async () => {
        const sender = await seedUser({ digipogs: 100, pin: hashedPin });
        const receiver = await seedUser({ digipogs: 0 });

        const result = await transferDigipogs({
            from: { id: sender.id, type: "user" },
            to: { id: receiver.id, type: "user" },
            amount: 50,
            pin: "1234",
            reason: "payment",
        });

        expect(result.success).toBe(true);

        const senderRow = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [sender.id]);
        const receiverRow = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [receiver.id]);
        expect(senderRow.digipogs).toBe(50);
        expect(receiverRow.digipogs).toBe(45); // 50 * 0.9 = 45
    });

    it("rejects insufficient funds", async () => {
        const sender = await seedUser({ digipogs: 5, pin: hashedPin });
        const receiver = await seedUser({ digipogs: 0 });

        const result = await transferDigipogs({
            from: { id: sender.id, type: "user" },
            to: { id: receiver.id, type: "user" },
            amount: 50,
            pin: "1234",
            reason: "",
        });

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Insufficient funds/);
    });

    it("rejects invalid PIN", async () => {
        const sender = await seedUser({ digipogs: 100, pin: hashedPin });
        const receiver = await seedUser({ digipogs: 0 });

        const result = await transferDigipogs({
            from: { id: sender.id, type: "user" },
            to: { id: receiver.id, type: "user" },
            amount: 10,
            pin: "9999",
            reason: "",
        });

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Invalid PIN/);
    });

    it("rejects transfer to same account", async () => {
        const user = await seedUser({ digipogs: 100, pin: hashedPin });

        const result = await transferDigipogs({
            from: { id: user.id, type: "user" },
            to: { id: user.id, type: "user" },
            amount: 10,
            pin: "1234",
            reason: "",
        });

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/same account/);
    });

    it("rejects missing required fields", async () => {
        const result = await transferDigipogs({
            from: { id: 1, type: "user" },
            to: { id: 2, type: "user" },
            amount: 10,
            reason: "",
        });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Missing required fields/);
    });

    it("does not accept client-supplied pinVerified as a PIN bypass", async () => {
        const sender = await seedUser({ digipogs: 100, pin: hashedPin });
        const receiver = await seedUser({ digipogs: 0 });

        const result = await transferDigipogs({
            from: { id: sender.id, type: "user" },
            to: { id: receiver.id, type: "user" },
            amount: 10,
            pinVerified: true,
            reason: "",
        });

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Missing required fields/);
    });

    it("allows trusted server-side callers to skip PIN verification", async () => {
        const sender = await seedUser({ digipogs: 100, pin: null });
        const receiver = await seedUser({ digipogs: 0 });

        const result = await transferDigipogs(
            {
                from: { id: sender.id, type: "user" },
                to: { id: receiver.id, type: "user" },
                amount: 10,
                reason: "",
            },
            { pinVerified: true }
        );

        expect(result.success).toBe(true);
    });

    it("rejects amount <= 0", async () => {
        const result = await transferDigipogs({
            from: { id: 1, type: "user" },
            to: { id: 2, type: "user" },
            amount: -5,
            pin: "1234",
            reason: "",
        });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/greater than zero/);
    });

    it("revokes the exact negative amount without tax", async () => {
        const teacher = await seedUser({ permissions: 4, digipogs: 100, pin: hashedPin });
        const student = await seedUser({ digipogs: 10 });

        const result = await transferDigipogs({
            from: { id: teacher.id, type: "user" },
            to: { id: student.id, type: "user" },
            amount: -4,
            pin: "1234",
            reason: "Revoked",
        });

        expect(result.success).toBe(true);

        const teacherRow = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [teacher.id]);
        const studentRow = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [student.id]);
        expect(teacherRow.digipogs).toBe(100);
        expect(studentRow.digipogs).toBe(6);
    });

    it("rejects invalid sender/recipient type", async () => {
        const result = await transferDigipogs({
            from: { id: 1, type: "class" },
            to: { id: 2, type: "user" },
            amount: 10,
            pin: "1234",
            reason: "",
        });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Invalid sender or recipient/);
    });

    it("rejects when sender account not found", async () => {
        const receiver = await seedUser({ digipogs: 0 });

        const result = await transferDigipogs({
            from: { id: 99999, type: "user" },
            to: { id: receiver.id, type: "user" },
            amount: 10,
            pin: "1234",
            reason: "",
        });

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Sender account not found/);
    });

    it("rejects when recipient account not found", async () => {
        const sender = await seedUser({ digipogs: 100, pin: hashedPin });

        const result = await transferDigipogs({
            from: { id: sender.id, type: "user" },
            to: { id: 99999, type: "user" },
            amount: 10,
            pin: "1234",
            reason: "",
        });

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Recipient account not found/);
    });

    it("rejects when PIN not configured", async () => {
        const sender = await seedUser({ digipogs: 100, pin: null });
        const receiver = await seedUser({ digipogs: 0 });

        const result = await transferDigipogs({
            from: { id: sender.id, type: "user" },
            to: { id: receiver.id, type: "user" },
            amount: 10,
            pin: "1234",
            reason: "",
        });

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/PIN not configured/);
    });

    it("taxes at least 1 digipog even for small amounts", async () => {
        const sender = await seedUser({ digipogs: 100, pin: hashedPin });
        const receiver = await seedUser({ digipogs: 0 });

        const result = await transferDigipogs({
            from: { id: sender.id, type: "user" },
            to: { id: receiver.id, type: "user" },
            amount: 1,
            pin: "1234",
            reason: "",
        });

        expect(result.success).toBe(true);
        const receiverRow = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [receiver.id]);
        // Math.floor(1 * 0.9) = 0 which is < 1, so taxedAmount = 1, recipient gets 1
        expect(receiverRow.digipogs).toBe(1);
    });

    it("transfers from user to pool", async () => {
        const sender = await seedUser({ digipogs: 100, pin: hashedPin });
        const poolId = await createPool({ name: "Target Pool", description: "desc", defaultShareholderId: sender.id });

        const result = await transferDigipogs({
            from: { id: sender.id, type: "user" },
            to: { id: poolId, type: "pool" },
            amount: 20,
            pin: "1234",
            reason: "",
        });

        expect(result.success).toBe(true);
        const poolRow = await mockDatabase.dbGet("SELECT amount FROM digipog_pools WHERE id = ?", [poolId]);
        expect(poolRow.amount).toBe(18); // 20 * 0.9 = 18
    });

    it("rejects when missing sender identifier", async () => {
        const result = await transferDigipogs({
            from: null,
            to: { id: 1, type: "user" },
            amount: 10,
            pin: "1234",
            reason: "",
        });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Missing sender identifier/);
    });

    it("rejects missing recipient in deprecated format", async () => {
        const result = await transferDigipogs({
            from: 1,
            to: { notAnId: true },
            amount: 10,
            pin: "1234",
            reason: "",
        });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Missing recipient identifier/);
    });

    it("creates a transaction record on success", async () => {
        const sender = await seedUser({ digipogs: 100, pin: hashedPin });
        const receiver = await seedUser({ digipogs: 0 });

        await transferDigipogs({
            from: { id: sender.id, type: "user" },
            to: { id: receiver.id, type: "user" },
            amount: 10,
            pin: "1234",
            reason: "test-txn",
        });

        const txns = await mockDatabase.dbGetAll("SELECT * FROM exchanges WHERE from_user_id = ? AND from_type = 'user'", [sender.id]);
        expect(txns).toHaveLength(1);
        expect(JSON.parse(txns[0].offer)["0"]).toBe(10);
        expect(txns[0].reason).toBe("test-txn");
    });

    it("deposits tax into dev pool (id=0) when it exists", async () => {
        await mockDatabase.dbRun("INSERT INTO digipog_pools (id, name, description, amount) VALUES (0, 'Dev Pool', 'tax', 0)");
        const sender = await seedUser({ digipogs: 100, pin: hashedPin });
        const receiver = await seedUser({ digipogs: 0 });

        await transferDigipogs({
            from: { id: sender.id, type: "user" },
            to: { id: receiver.id, type: "user" },
            amount: 100,
            pin: "1234",
            reason: "",
        });

        const devPool = await mockDatabase.dbGet("SELECT amount FROM digipog_pools WHERE id = 0");
        expect(devPool.amount).toBe(10); // 100 - floor(100*0.9) = 10
    });
});
