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

const { getUserInventory, getItemById, addItemToInventory, removeItemFromInventory, registerItem } = require("@services/inventory-service");
const { createApp } = require("@services/app-service");

beforeAll(async () => {
    mockDatabase = await createTestDb();
});

beforeEach(async () => {
    await registerItem({
        name: "Test Item",
        description: "A test item for inventory service tests",
        stackSize: 100,
        iconUrl: null,
    });
    await registerItem({
        name: "Another Item",
        description: "Another test item for inventory service tests",
        stackSize: 50,
        iconUrl: null,
    });
});

afterEach(async () => {
    await mockDatabase.reset();
});

afterAll(async () => {
    await mockDatabase.close();
});

const USER_ID = 1;
const SHARE_APP_INPUT = { name: "ShareApp", description: "A test application", ownerId: USER_ID, shareItemId: 3 };

describe("getUserInventory()", () => {
    it("returns an empty array when the user has no items", async () => {
        const result = await getUserInventory(USER_ID);
        expect(result).toEqual([]);
    });

    it("returns all items belonging to the user", async () => {
        await addItemToInventory(USER_ID, 1, 3);
        await addItemToInventory(USER_ID, 2, 1);
        const result = await getUserInventory(USER_ID);
        expect(result).toHaveLength(2);
        expect(result).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: 1, quantity: 3 }), expect.objectContaining({ id: 2, quantity: 1 })])
        );
    });

    it("does not return items belonging to other users", async () => {
        await addItemToInventory(USER_ID, 1, 1);
        await addItemToInventory(2, 2, 5); // different user
        const result = await getUserInventory(USER_ID);
        expect(result).toHaveLength(1);
    });

    it("returns rows with item_id and quantity fields", async () => {
        await addItemToInventory(USER_ID, 1, 7);
        const result = await getUserInventory(USER_ID);
        expect(result[0]).toHaveProperty("id", 1);
        expect(result[0]).toHaveProperty("quantity", 7);
    });
});

describe("getItemById()", () => {
    it("returns item info for a valid item id", async () => {
        const item = await getItemById(1);
        expect(item).toHaveProperty("id", 1);
        expect(item).toHaveProperty("name", "Test Item");
    });
});

describe("addItemToInventory()", () => {
    it("inserts a new row when the item does not exist", async () => {
        await addItemToInventory(USER_ID, 1, 3);
        const inventory = await getUserInventory(USER_ID);
        const item = inventory[0];
        expect(item).toBeDefined();
        expect(item.quantity).toBe(3);
    });

    it("handles multiple rows for the same item correctly", async () => {
        await addItemToInventory(USER_ID, 1, 95);
        await addItemToInventory(USER_ID, 1, 10); // should create a new row with quantity 5
        const inventory = await getUserInventory(USER_ID);
        expect(inventory).toHaveLength(1);
        const totalQuantity = inventory.reduce((sum, item) => sum + item.quantity, 0);
        expect(totalQuantity).toBe(105);
    });

    it("increments the quantity when the item already exists", async () => {
        await addItemToInventory(USER_ID, 1, 3);
        await addItemToInventory(USER_ID, 1, 2);
        const inventory = await getUserInventory(USER_ID);
        expect(inventory[0].quantity).toBe(5);
    });

    it("handles adding to multiple different items independently", async () => {
        await addItemToInventory(USER_ID, 1, 1);
        await addItemToInventory(USER_ID, 2, 4);
        const inventory = await getUserInventory(USER_ID);
        const item1 = inventory[0];
        const item2 = inventory[1];
        expect(item1.quantity).toBe(1);
        expect(item2.quantity).toBe(4);
    });
});

describe("removeItemFromInventory()", () => {
    it("decrements the quantity when more than 'quantity' remain", async () => {
        await addItemToInventory(USER_ID, 1, 10);
        await removeItemFromInventory(USER_ID, 1, 3);
        const inventory = await getUserInventory(USER_ID);
        expect(inventory[0].quantity).toBe(7);
    });

    it("deletes the row when removing exactly the full quantity", async () => {
        await addItemToInventory(USER_ID, 1, 5);
        await removeItemFromInventory(USER_ID, 1, 5);
        const inventory = await getUserInventory(USER_ID);
        expect(inventory).toHaveLength(0);
    });

    it("deletes the row when removing more than the current quantity", async () => {
        await addItemToInventory(USER_ID, 1, 2);
        await removeItemFromInventory(USER_ID, 1, 10);
        const inventory = await getUserInventory(USER_ID);
        expect(inventory).toHaveLength(0);
    });

    it("throws NotFoundError when the item does not exist in inventory", async () => {
        await expect(removeItemFromInventory(USER_ID, 999, 1)).rejects.toThrow(/not found/i);
    });

    it("does not affect other users' inventory", async () => {
        await addItemToInventory(USER_ID, 1, 5);
        await addItemToInventory(2, 1, 5);
        await removeItemFromInventory(USER_ID, 1, 5);

        const otherInventory = await getUserInventory(2);
        expect(otherInventory[0].quantity).toBe(5);
    });

    it("handles item overflow correctly", async () => {
        await addItemToInventory(USER_ID, 1, 95);
        await addItemToInventory(USER_ID, 1, 10); // should create a new row with quantity 5
        const inventory = await getUserInventory(USER_ID);
        const totalQuantity = inventory.reduce((sum, item) => sum + item.quantity, 0);
        expect(inventory).toHaveLength(1);
        expect(totalQuantity).toBe(105);
    });

    it("handles item underflow correctly", async () => {
        await addItemToInventory(USER_ID, 1, 5);
        await removeItemFromInventory(USER_ID, 1, 10);
        const inventory = await getUserInventory(USER_ID);
        expect(inventory).toHaveLength(0);
    });

	it("throws ConflictError when item is a share and user is highest shareholder", async () => {
		const createdApp = await createApp(SHARE_APP_INPUT);
       	const app = await mockDatabase.dbGet("SELECT share_item_id FROM apps WHERE id = ?", [createdApp.appId]);
		await expect(removeItemFromInventory(USER_ID, app.share_item_id, 3)).rejects.toThrow(/main shareholder/i);

		const inventory = await getUserInventory(USER_ID);
		expect(inventory[0].quantity).toBe(100);
	});

	it("sends item shares to highest shareholder upon deletion", async () => {
		const createdApp = await createApp(SHARE_APP_INPUT);
       	const app = await mockDatabase.dbGet("SELECT share_item_id FROM apps WHERE id = ?", [createdApp.appId]);
		
		await addItemToInventory(2, app.share_item_id, 20);
		await removeItemFromInventory(2, app.share_item_id, 20);

		const inventory = await getUserInventory(USER_ID);
		expect(inventory[0].quantity).toBe(120);

		const inventoryU2 = await getUserInventory(2);
		expect(inventoryU2.length).toBe(0);
	});
});
