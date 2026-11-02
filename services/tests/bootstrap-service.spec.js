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

const { ensureFormbarDeveloperPool } = require("@services/bootstrap-service");

beforeAll(async () => {
    mockDatabase = await createTestDb();
});

afterEach(async () => {
    await mockDatabase.reset();
});

afterAll(async () => {
    await mockDatabase.close();
});

describe("ensureFormbarDeveloperPool()", () => {
    it("creates the Formbar Developer Pool (id=0) when it does not exist", async () => {
        const before = await mockDatabase.dbGet("SELECT * FROM digipog_pools WHERE id = 0");
        expect(before).toBeUndefined();

        await ensureFormbarDeveloperPool();

        const pool = await mockDatabase.dbGet("SELECT * FROM digipog_pools WHERE id = 0");
        expect(pool).toBeDefined();
        expect(pool.id).toBe(0);
        expect(pool.name).toBe("Formbar Developer Pool");
        expect(pool.amount).toBe(0);
    });

    it("adds user 1 (id=1) as top holder", async () => {
        await ensureFormbarDeveloperPool();
        const member = await mockDatabase.dbGet("SELECT * FROM inventory WHERE user_id = 1");
        expect(member).toBeDefined();
        expect(member.item_id).toBe(1);
    });

    it("is idempotent – calling it twice does not create duplicate pools", async () => {
        await ensureFormbarDeveloperPool();
        await ensureFormbarDeveloperPool();

        const pools = await mockDatabase.dbGetAll("SELECT * FROM digipog_pools WHERE id = 0");
        expect(pools).toHaveLength(1);
    });

    it("is idempotent – calling it twice does not create duplicate pool members", async () => {
        await ensureFormbarDeveloperPool();
        await ensureFormbarDeveloperPool();

        const members = await mockDatabase.dbGetAll("SELECT * FROM inventory WHERE user_id = 1");
        expect(members).toHaveLength(1);
    });
});
