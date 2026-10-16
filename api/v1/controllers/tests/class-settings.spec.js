const request = require("supertest");
const { createTestDb } = require("@test-helpers/db");
const { createTestApp, seedAuthenticatedUser, seedClassMembership, clearClassStateStore } = require("./helpers/test-app");

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

jest.mock("@modules/config", () => {
    const crypto = require("crypto");
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    return {
        settings: { emailEnabled: false, oidcProviders: [] },
        publicKey,
        privateKey,
        frontendUrl: "http://localhost:3000",
    };
});

jest.mock("@modules/web-server", () => ({
    io: { to: () => ({ emit: jest.fn() }) },
}));

jest.mock("@services/socket-updates-service", () => ({
    advancedEmitToClass: jest.fn(),
    emitToUser: jest.fn(),
    setClassOfApiSockets: jest.fn(),
    setClassOfUserSockets: jest.fn(),
    userUpdateSocket: jest.fn(),
    invalidateClassPollCache: jest.fn(),
}));

jest.mock("@stores/socket-state-store", () => ({
    socketStateStore: {
        getUserSocketsByEmail: jest.fn().mockReturnValue(null),
    },
}));

const createController = require("../class/create");
const joinController = require("../class/join");
const settingsController = require("../class/settings");
const { classStateStore } = require("@services/classroom-service");

const app = createTestApp(createController, joinController, settingsController);

beforeAll(async () => {
    mockDatabase = await createTestDb();
});

afterEach(async () => {
    await mockDatabase.reset();
    clearClassStateStore();
});

afterAll(async () => {
    await mockDatabase.close();
});

async function setupClassWithStudent() {
    const { tokens: teacherTokens, user: teacher } = await seedAuthenticatedUser(mockDatabase, {
        email: "teacher@test.com",
        displayName: "Teacher",
        permissions: 4,
    });

    const createRes = await request(app)
        .post("/api/v1/class/create")
        .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
        .send({ name: "Test Class" });
    const classId = createRes.body.data.classId;

    // Teacher must join so they appear in classroom.students (required by hasClassScope)
    await request(app).post(`/api/v1/class/${classId}/join`).set("Authorization", `Bearer ${teacherTokens.accessToken}`);

    const { tokens: studentTokens, user: student } = await seedAuthenticatedUser(mockDatabase, {
        email: "student@test.com",
        displayName: "Student1",
        permissions: 2,
    });

    await seedClassMembership(mockDatabase, student.id, classId, 2);

    await request(app).post(`/api/v1/class/${classId}/join`).set("Authorization", `Bearer ${studentTokens.accessToken}`);

    return { classId, teacherTokens, studentTokens, teacher, student };
}

describe("PATCH /api/v1/class/:id/settings", () => {
    it("returns 401 without authentication", async () => {
        const res = await request(app).patch("/api/v1/class/1/settings").send({ setting: "mute", value: true });
        expect(res.status).toBe(401);
    });

    it("returns 403 when user lacks class.session.settings scope", async () => {
        const { classId, studentTokens } = await setupClassWithStudent();

        const res = await request(app)
            .patch(`/api/v1/class/${classId}/settings`)
            .set("Authorization", `Bearer ${studentTokens.accessToken}`)
            .send({ setting: "mute", value: true });

        expect(res.status).toBe(403);
    });

    it("returns 400 when setting is missing", async () => {
        const { classId, teacherTokens } = await setupClassWithStudent();

        const res = await request(app)
            .patch(`/api/v1/class/${classId}/settings`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ value: true });

        expect(res.status).toBe(400);
    });

    it("returns 400 when value is missing", async () => {
        const { classId, teacherTokens } = await setupClassWithStudent();

        const res = await request(app)
            .patch(`/api/v1/class/${classId}/settings`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ setting: "mute" });

        expect(res.status).toBe(400);
    });

    it("returns 400 for an invalid setting key", async () => {
        const { classId, teacherTokens } = await setupClassWithStudent();

        const res = await request(app)
            .patch(`/api/v1/class/${classId}/settings`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ setting: "nonExistent", value: true });

        expect(res.status).toBe(400);
    });

    it("updates classroom name successfully", async () => {
        const { classId, teacherTokens } = await setupClassWithStudent();
        const newName = "Renamed Class";

        const res = await request(app)
            .patch(`/api/v1/class/${classId}/settings`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: newName });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(classStateStore.getClassroom(classId).className).toBe(newName);

        const dbClass = await mockDatabase.dbGet("SELECT name FROM classroom WHERE id = ?", [classId]);
        expect(dbClass.name).toBe(newName);
    });

    it("updates and persists the default enrollment role", async () => {
        const { classId, teacherTokens } = await setupClassWithStudent();
        const role = await mockDatabase.dbGet(
            `SELECT r.id
             FROM roles r
             JOIN class_roles cr ON cr.roleId = r.id
             WHERE r.name = ? AND cr.classId = ?`,
            ["Mod", classId]
        );

        const res = await request(app)
            .patch(`/api/v1/class/${classId}/settings`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ defaultRoleId: role.id });

        expect(res.status).toBe(200);
        expect(classStateStore.getClassroom(classId).settings.defaultRoleId).toBe(role.id);

        const dbClass = await mockDatabase.dbGet("SELECT settings FROM classroom WHERE id = ?", [classId]);
        expect(JSON.parse(dbClass.settings).defaultRoleId).toBe(role.id);
    });

    it("rejects a default role that is not available in the class", async () => {
        const { classId, teacherTokens } = await setupClassWithStudent();

        const res = await request(app)
            .patch(`/api/v1/class/${classId}/settings`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ defaultRoleId: 999999 });

        expect(res.status).toBe(400);
    });

    it("returns 400 when classroom name is invalid", async () => {
        const { classId, teacherTokens } = await setupClassWithStudent();

        const res = await request(app)
            .patch(`/api/v1/class/${classId}/settings`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "@@@" });

        expect(res.status).toBe(400);
    });
});
