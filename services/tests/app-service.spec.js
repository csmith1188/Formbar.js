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

jest.mock("@modules/config", () => ({
    settings: { emailEnabled: false },
    frontendUrl: "http://localhost:3000",
    rateLimit: { maxAttempts: 5, lockoutDuration: 900000, minDelayBetweenAttempts: 1000, attemptWindow: 300000 },
}));

jest.mock("@services/digipog-service", () => ({
    createPool: jest.fn(() => 42),
}));

jest.mock("@services/inventory-service", () => ({
    registerItem: jest.fn(() => 7),
    addItemToInventory: jest.fn(),
}));

const { createApp } = require("@services/app-service");
const { createPool } = require("@services/digipog-service");
const { registerItem, addItemToInventory } = require("@services/inventory-service");

beforeAll(async () => {
    mockDatabase = await createTestDb();
    await mockDatabase.dbRun(`CREATE TABLE IF NOT EXISTS apps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        owner_user_id INTEGER NOT NULL,
        share_item_id INTEGER,
        pool_id INTEGER,
        client_secret_hash TEXT
    )`);
});

afterEach(async () => {
    await mockDatabase.dbRun("DELETE FROM apps");
    jest.clearAllMocks();
});

afterAll(async () => {
    await mockDatabase.close();
});

const APP_INPUT = { name: "TestApp", description: "A test application", ownerId: 1, shareItemId: 7 };

describe("createApp()", () => {
    it("returns appId, apiKey, and apiSecret", async () => {
        const result = await createApp(APP_INPUT);

        expect(result).toHaveProperty("appId");
        expect(result).toHaveProperty("apiKey");
        expect(result).toHaveProperty("apiSecret");
    });

    it("returns apiKey and apiSecret as hex strings of expected lengths", async () => {
        const result = await createApp(APP_INPUT);

        expect(result.apiKey).toMatch(/^[0-9a-f]{128}$/);
        expect(result.apiSecret).toMatch(/^[0-9a-f]{512}$/);
    });

    it("calls createPool with correct name and ownerId", async () => {
        await createApp(APP_INPUT);

        expect(createPool).toHaveBeenCalledWith({
            name: "TestApp Developer Pool",
            description: APP_INPUT.description,
            ownerId: APP_INPUT.ownerId,
			shareItemId: APP_INPUT.shareItemId
        });
    });

    it("calls registerItem with share item name", async () => {
        await createApp(APP_INPUT);

        expect(registerItem).toHaveBeenCalledWith(expect.objectContaining({ name: "TestApp Share" }));
    });

    it("calls addItemToInventory with ownerId and shareItemId", async () => {
        await createApp(APP_INPUT);

        expect(addItemToInventory).toHaveBeenCalledWith(APP_INPUT.ownerId, 7, 100);
    });

    it("inserts row into apps table with hashed key/secret", async () => {
        const result = await createApp(APP_INPUT);

        const row = await mockDatabase.dbGet("SELECT * FROM apps WHERE id = ?", [result.appId]);

        expect(row.name).toBe(APP_INPUT.name);
        expect(row.description).toBe(APP_INPUT.description);
        expect(row.owner_user_id).toBe(APP_INPUT.ownerId);
        expect(row.share_item_id).toBe(7);
        expect(row.pool_id).toBe(42);
    });
});
