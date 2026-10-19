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
    isPoolOwnedByUser,
    poolOwnerCheck,
    addUserToPool,
    removeUserFromPool,
    setUserOwnerFlag,
    addMemberToPool,
    removeMemberFromPool,
    payoutPool,
    getUserTransactions,
    getUserTransactionsPaginated,
    awardDigipogs,
    transferDigipogs,
} = require("@services/digipog-service");

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

async function seedTransaction(from_id, to_id, from_type, to_type, amount, reason = "test") {
    await mockDatabase.dbRun("INSERT INTO transactions (from_id, to_id, from_type, to_type, amount, reason, date) VALUES (?, ?, ?, ?, ?, ?, ?)", [
        from_id,
        to_id,
        from_type,
        to_type,
        amount,
        reason,
        Date.now(),
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
        const poolId = await createPool({ name: "My Pool", description: "desc", ownerId: user.id });

        const pool = await getPoolById(poolId);
        expect(pool.name).toBe("My Pool");
        expect(pool.amount).toBe(0);
        const shareItem = await mockDatabase.dbGet("SELECT name, description, stack_size FROM item_registry WHERE id = ?", [pool.share_item]);
        expect(shareItem).toEqual({ name: "My Pool Share", description: "Share of My Pool", stack_size: 100 });
        const shares = await mockDatabase.dbGet("SELECT quantity FROM inventory WHERE user_id = ? AND item_id = ?", [user.id, pool.share_item]);
        expect(shares.quantity).toBe(100);

        const ownerFlag = await isPoolOwnedByUser(poolId, user.id);
        expect(ownerFlag).toBe(true);
    });

    it("defaults description to empty string", async () => {
        const user = await seedUser();
        const poolId = await createPool({ name: "No Desc", ownerId: user.id });
        const pool = await getPoolById(poolId);
        expect(pool.description).toBe("");
    });
});

describe("deletePool()", () => {
    it("removes the pool and all pool_users rows", async () => {
        const user = await seedUser();
        const poolId = await createPool({ name: "Gone", ownerId: user.id });

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
        const poolId = await createPool({ name: "P1", ownerId: user.id });

        const pools = await getPoolsForUser(user.id);
        expect(pools).toHaveLength(1);
        expect(pools[0]).toEqual({ pool_id: poolId, owner: 1 });
    });

    it("returns empty array for user with no pools", async () => {
        const user = await seedUser();
        expect(await getPoolsForUser(user.id)).toHaveLength(0);
    });
});

describe("getPoolsForUserPaginated()", () => {
    it("returns paginated pools with total count", async () => {
        const user = await seedUser();
        await createPool({ name: "A", ownerId: user.id });
        await createPool({ name: "B", ownerId: user.id });
        await createPool({ name: "C", ownerId: user.id });

        const result = await getPoolsForUserPaginated(user.id, 2, 0);
        expect(result.pools).toHaveLength(2);
        expect(result.total).toBe(3);
    });

    it("respects offset", async () => {
        const user = await seedUser();
        await createPool({ name: "A", ownerId: user.id });
        await createPool({ name: "B", ownerId: user.id });
        await createPool({ name: "C", ownerId: user.id });

        const result = await getPoolsForUserPaginated(user.id, 2, 2);
        expect(result.pools).toHaveLength(1);
        expect(result.total).toBe(3);
    });
});

describe("getUsersForPool()", () => {
    it("returns all users in a pool", async () => {
        const owner = await seedUser();
        const member = await seedUser();
        const poolId = await createPool({ name: "Team", ownerId: owner.id });
        await addUserToPool(poolId, member.id, 0);

        const users = await getUsersForPool(poolId);
        expect(users).toHaveLength(2);
    });
});

describe("isUserInPool()", () => {
    it("returns true for member", async () => {
        const user = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: user.id });
        expect(await isUserInPool(user.id, poolId)).toBe(true);
    });

    it("returns false for non-member", async () => {
        const pool = await seedPool();
        const user = await seedUser();
        expect(await isUserInPool(user.id, pool.id)).toBe(false);
    });
});

describe("isPoolOwnedByUser()", () => {
    it("returns true for owner", async () => {
        const user = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: user.id });
        expect(await isPoolOwnedByUser(poolId, user.id)).toBe(true);
    });

    it("returns false for non-owner member", async () => {
        const owner = await seedUser();
        const member = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: owner.id });
        await addUserToPool(poolId, member.id, 0);
        expect(await isPoolOwnedByUser(poolId, member.id)).toBe(false);
    });

    it("returns false for non-member", async () => {
        const pool = await seedPool();
        const user = await seedUser();
        expect(await isPoolOwnedByUser(pool.id, user.id)).toBe(false);
    });
});

describe("poolOwnerCheck()", () => {
    it("returns true when req.user owns the pool", async () => {
        const user = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: user.id });
        const req = { user: { id: user.id }, params: { id: String(poolId) } };
        expect(await poolOwnerCheck(req)).toBe(true);
    });

    it("returns false when req.user does not own the pool", async () => {
        const owner = await seedUser();
        const other = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: owner.id });
        const req = { user: { id: other.id }, params: { id: String(poolId) } };
        expect(await poolOwnerCheck(req)).toBe(false);
    });
});

describe("addUserToPool()", () => {
    it("adds a user as non-owner by default", async () => {
        const pool = await seedPool();
        const user = await seedUser();
        await addUserToPool(pool.id, user.id);

        expect(await isUserInPool(user.id, pool.id)).toBe(true);
        expect(await isPoolOwnedByUser(pool.id, user.id)).toBe(false);
    });

    it("adds a user as owner when flag is truthy", async () => {
        const pool = await seedPool();
        const user = await seedUser();
        await addUserToPool(pool.id, user.id, 1);
        expect(await isPoolOwnedByUser(pool.id, user.id)).toBe(true);
    });

    it("replaces existing entry on duplicate", async () => {
        const pool = await seedPool();
        const user = await seedUser();
        await addUserToPool(pool.id, user.id, 0);
        await addUserToPool(pool.id, user.id, 1);
        expect(await isPoolOwnedByUser(pool.id, user.id)).toBe(true);
    });
});

describe("removeUserFromPool()", () => {
    it("removes a non-owner member without deleting the pool", async () => {
        const owner = await seedUser();
        const member = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: owner.id });
        await addUserToPool(poolId, member.id, 0);

        await removeUserFromPool(poolId, member.id);

        expect(await isUserInPool(member.id, poolId)).toBe(false);
        expect(await getPoolById(poolId)).toBeDefined();
    });

    it("deletes the entire pool when the sole owner is removed", async () => {
        const owner = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: owner.id });

        await removeUserFromPool(poolId, owner.id);

        expect(await getPoolById(poolId)).toBeUndefined();
    });

    it("does not delete pool if another owner exists", async () => {
        const owner1 = await seedUser();
        const owner2 = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: owner1.id });
        await addUserToPool(poolId, owner2.id, 1);

        await removeUserFromPool(poolId, owner1.id);

        expect(await getPoolById(poolId)).toBeDefined();
        expect(await isUserInPool(owner1.id, poolId)).toBe(false);
        expect(await isPoolOwnedByUser(poolId, owner2.id)).toBe(true);
    });
});

describe("setUserOwnerFlag()", () => {
    it("promotes a member to owner", async () => {
        const owner = await seedUser();
        const member = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: owner.id });
        await addUserToPool(poolId, member.id, 0);

        await setUserOwnerFlag(poolId, member.id, 1);
        expect(await isPoolOwnedByUser(poolId, member.id)).toBe(true);
    });

    it("demotes an owner to member", async () => {
        const owner = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: owner.id });

        await setUserOwnerFlag(poolId, owner.id, 0);
        expect(await isPoolOwnedByUser(poolId, owner.id)).toBe(false);
    });
});

describe("addMemberToPool()", () => {
    it("adds a user to a pool the acting user owns", async () => {
        const owner = await seedUser();
        const member = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: owner.id });

        const result = await addMemberToPool({ actingUserId: owner.id, poolId, userId: member.id });
        expect(result).toEqual({ success: true, message: "User added to pool successfully." });
        expect(await isUserInPool(member.id, poolId)).toBe(true);
    });

    it("rejects invalid pool ID", async () => {
        const result = await addMemberToPool({ actingUserId: 1, poolId: -1, userId: 2 });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Invalid pool ID/);
    });

    it("rejects invalid user ID", async () => {
        const result = await addMemberToPool({ actingUserId: 1, poolId: 1, userId: -1 });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Invalid user ID/);
    });

    it("rejects when acting user is not owner", async () => {
        const owner = await seedUser();
        const nonOwner = await seedUser();
        const member = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: owner.id });

        const result = await addMemberToPool({ actingUserId: nonOwner.id, poolId, userId: member.id });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/do not own/);
    });

    it("rejects when target user does not exist", async () => {
        const owner = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: owner.id });

        const result = await addMemberToPool({ actingUserId: owner.id, poolId, userId: 99999 });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/User not found/);
    });

    it("rejects when user is already in pool", async () => {
        const owner = await seedUser();
        const member = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: owner.id });
        await addUserToPool(poolId, member.id, 0);

        const result = await addMemberToPool({ actingUserId: owner.id, poolId, userId: member.id });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/already a member/);
    });
});

describe("removeMemberFromPool()", () => {
    it("removes a member from the pool", async () => {
        const owner = await seedUser();
        const member = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: owner.id });
        await addUserToPool(poolId, member.id, 0);

        const result = await removeMemberFromPool({ actingUserId: owner.id, poolId, userId: member.id });
        expect(result).toEqual({ success: true, message: "User removed from pool successfully." });
        expect(await isUserInPool(member.id, poolId)).toBe(false);
    });

    it("rejects invalid pool ID", async () => {
        const result = await removeMemberFromPool({ actingUserId: 1, poolId: -1, userId: 2 });
        expect(result.success).toBe(false);
    });

    it("rejects invalid user ID", async () => {
        const result = await removeMemberFromPool({ actingUserId: 1, poolId: 1, userId: -1 });
        expect(result.success).toBe(false);
    });

    it("rejects when acting user is not owner", async () => {
        const owner = await seedUser();
        const nonOwner = await seedUser();
        const member = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: owner.id });
        await addUserToPool(poolId, member.id, 0);

        const result = await removeMemberFromPool({ actingUserId: nonOwner.id, poolId, userId: member.id });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/do not own/);
    });

    it("rejects when target user is not in pool", async () => {
        const owner = await seedUser();
        const outsider = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: owner.id });

        const result = await removeMemberFromPool({ actingUserId: owner.id, poolId, userId: outsider.id });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/not a member/);
    });
});

describe("payoutPool()", () => {
    it("distributes pool amount equally among members", async () => {
        const owner = await seedUser({ digipogs: 0 });
        const member = await seedUser({ digipogs: 0 });
        const poolId = await createPool({ name: "P", ownerId: owner.id });
        await addUserToPool(poolId, member.id, 0);
        await mockDatabase.dbRun("UPDATE digipog_pools SET amount = 100 WHERE id = ?", [poolId]);

        const result = await payoutPool({ actingUserId: owner.id, poolId });
        expect(result).toEqual({ success: true, message: "Pool payout successful." });

        const ownerRow = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [owner.id]);
        const memberRow = await mockDatabase.dbGet("SELECT digipogs FROM users WHERE id = ?", [member.id]);
        expect(ownerRow.digipogs).toBe(50);
        expect(memberRow.digipogs).toBe(50);

        const pool = await getPoolById(poolId);
        expect(pool.amount).toBe(0);
    });

    it("creates transaction records for each payout", async () => {
        const owner = await seedUser({ digipogs: 0 });
        const poolId = await createPool({ name: "P", ownerId: owner.id });
        await mockDatabase.dbRun("UPDATE digipog_pools SET amount = 50 WHERE id = ?", [poolId]);

        await payoutPool({ actingUserId: owner.id, poolId });

        const txns = await mockDatabase.dbGetAll("SELECT * FROM transactions WHERE from_id = ? AND from_type = 'pool'", [poolId]);
        expect(txns).toHaveLength(1);
        expect(txns[0].to_id).toBe(owner.id);
        expect(txns[0].amount).toBe(50);
        expect(txns[0].reason).toBe("Pool Payout");
    });

    it("floors per-member amount for uneven splits", async () => {
        const owner = await seedUser({ digipogs: 0 });
        const m1 = await seedUser({ digipogs: 0 });
        const m2 = await seedUser({ digipogs: 0 });
        const poolId = await createPool({ name: "P", ownerId: owner.id });
        await addUserToPool(poolId, m1.id, 0);
        await addUserToPool(poolId, m2.id, 0);
        await mockDatabase.dbRun("UPDATE digipog_pools SET amount = 10 WHERE id = ?", [poolId]);

        await payoutPool({ actingUserId: owner.id, poolId });

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
        const poolId = await createPool({ name: "P", ownerId: owner.id });

        const result = await payoutPool({ actingUserId: other.id, poolId });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/do not own/);
    });

    it("rejects when pool is not found", async () => {
        const user = await seedUser();
        const poolId = await createPool({ name: "P", ownerId: user.id });
        // Delete the pool row but leave pool_users so isPoolOwnedByUser passes
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
        await seedTransaction(sender.id, receiver.id, "user", "user", 10, "gift");

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
        await seedTransaction(sender.id, receiver.id, "user", "user", 5);

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
            await seedTransaction(user.id, other.id, "user", "user", i + 1, `txn-${i}`);
        }

        const result = await getUserTransactionsPaginated(user.id, 2, 0);
        expect(result.transactions).toHaveLength(2);
        expect(result.total).toBe(5);
    });

    it("enriches pool-type transactions", async () => {
        const user = await seedUser();
        const pool = await seedPool("Enriched Pool", 50);
        await seedTransaction(pool.id, user.id, "pool", "user", 25, "payout");

        const result = await getUserTransactionsPaginated(user.id, 10, 0);
        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].from.type).toBe("pool");
        expect(result.transactions[0].from.username).toBe("Enriched Pool");
    });

    it("enriches class-type transactions", async () => {
        const user = await seedUser();
        await mockDatabase.dbRun("INSERT INTO classroom (name, owner, key) VALUES (?, ?, ?)", ["TestClass", user.id, "key123"]);
        const classRow = await mockDatabase.dbGet("SELECT id FROM classroom WHERE name = 'TestClass'");
        await seedTransaction(user.id, classRow.id, "user", "class", 10, "class-award");

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

    it("handles deprecated plain-ID format with warning", async () => {
        const teacher = await seedUser({ permissions: 4 });
        const student = await seedUser({ digipogs: 0 });

        await mockDatabase.dbRun("INSERT INTO classroom (name, owner, key) VALUES (?, ?, ?)", ["C2", teacher.id, "k2"]);
        const classRow = await mockDatabase.dbGet("SELECT id FROM classroom WHERE owner = ?", [teacher.id]);
        await mockDatabase.dbRun("INSERT INTO classusers (classId, studentId, digiPogs) VALUES (?, ?, ?)", [classRow.id, student.id, 0]);

        const result = await awardDigipogs({ to: student.id, amount: 5 }, { id: teacher.id });
        expect(result.success).toBe(true);
        expect(result.message).toMatch(/Deprecated/);
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
        const pool = await seedPool("Target Pool", 0);
        const receiver = await seedUser({ digipogs: 0 });

        const result = await transferDigipogs({
            from: { id: sender.id, type: "user" },
            to: { id: pool.id, type: "pool" },
            amount: 20,
            pin: "1234",
            reason: "",
        });

        expect(result.success).toBe(true);
        const poolRow = await mockDatabase.dbGet("SELECT amount FROM digipog_pools WHERE id = ?", [pool.id]);
        expect(poolRow.amount).toBe(18); // 20 * 0.9 = 18
    });

    it("handles deprecated plain-ID format", async () => {
        const sender = await seedUser({ digipogs: 100, pin: hashedPin });
        const receiver = await seedUser({ digipogs: 0 });

        const result = await transferDigipogs({
            from: sender.id,
            to: receiver.id,
            amount: 10,
            pin: "1234",
            reason: "",
        });

        expect(result.success).toBe(true);
        expect(result.message).toMatch(/Deprecated/);
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

        const txns = await mockDatabase.dbGetAll("SELECT * FROM transactions WHERE from_id = ? AND from_type = 'user'", [sender.id]);
        expect(txns).toHaveLength(1);
        expect(txns[0].amount).toBe(10);
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
