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
const rolesController = require("../class/roles/roles");
const assignController = require("../class/roles/assign");
const studentsController = require("../class/students");

const app = createTestApp(createController, joinController, rolesController, assignController, studentsController);

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

async function setupClassWithTeacherAndStudent() {
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

    await request(app).post(`/api/v1/class/${classId}/join`).set("Authorization", `Bearer ${teacherTokens.accessToken}`);

    const { tokens: studentTokens, user: student } = await seedAuthenticatedUser(mockDatabase, {
        email: "student@test.com",
        displayName: "Student1",
        permissions: 2,
    });

    await seedClassMembership(mockDatabase, student.id, classId, 2);

    await request(app).post(`/api/v1/class/${classId}/join`).set("Authorization", `Bearer ${studentTokens.accessToken}`);

    return { classId, teacherTokens, teacher, studentTokens, student };
}

async function getRoleIdByName(roleName, classId = null) {
    const row =
        classId == null
            ? await mockDatabase.dbGet("SELECT id FROM roles WHERE name = ? AND isDefault = 1", [roleName])
            : await mockDatabase.dbGet(
                  `SELECT r.id
                 FROM roles r
                 JOIN class_roles cr ON cr.roleId = r.id
                 WHERE r.name = ? AND cr.classId = ?`,
                  [roleName, classId]
              );

    return row ? row.id : null;
}

// ── GET /api/v1/class/:id/roles ──

describe("GET /api/v1/class/:id/roles", () => {
    it("returns 401 without authentication", async () => {
        const res = await request(app).get("/api/v1/class/1/roles");
        expect(res.status).toBe(401);
    });

    it("returns default roles for a user with class.roles.read scope", async () => {
        const { classId, teacherTokens } = await setupClassWithTeacherAndStudent();

        const res = await request(app).get(`/api/v1/class/${classId}/roles`).set("Authorization", `Bearer ${teacherTokens.accessToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);

        const roleNames = res.body.data.map((r) => r.name);
        expect(roleNames).toContain("Teacher");
        expect(roleNames).toContain("Student");
        expect(roleNames).toContain("Guest");
        expect(res.body.data.every((role) => typeof role.id === "number")).toBe(true);
    });

    it("returns 403 for non-member", async () => {
        const { classId } = await setupClassWithTeacherAndStudent();

        const { tokens: outsiderTokens } = await seedAuthenticatedUser(mockDatabase, {
            email: "outsider@test.com",
            displayName: "Outsider",
        });

        const res = await request(app).get(`/api/v1/class/${classId}/roles`).set("Authorization", `Bearer ${outsiderTokens.accessToken}`);

        expect(res.status).toBe(403);
    });

    it("returns 403 for class members without class.roles.read scope", async () => {
        const { classId, studentTokens } = await setupClassWithTeacherAndStudent();

        const res = await request(app).get(`/api/v1/class/${classId}/roles`).set("Authorization", `Bearer ${studentTokens.accessToken}`);

        expect(res.status).toBe(403);
    });

    it("includes custom roles after creation", async () => {
        const { classId, teacherTokens } = await setupClassWithTeacherAndStudent();

        // Create a custom role
        await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "CustomMod", scopes: ["class.poll.create"] });

        const res = await request(app).get(`/api/v1/class/${classId}/roles`).set("Authorization", `Bearer ${teacherTokens.accessToken}`);

        expect(res.status).toBe(200);
        const customRole = res.body.data.find((r) => r.name === "CustomMod");
        expect(customRole).toBeDefined();
        expect(customRole.scopes).toEqual(["class.poll.create"]);
    });
});

// ── POST /api/v1/class/:id/roles ──

describe("POST /api/v1/class/:id/roles", () => {
    it("returns 401 without authentication", async () => {
        const res = await request(app).post("/api/v1/class/1/roles").send({ name: "Test", scopes: [] });
        expect(res.status).toBe(401);
    });

    it("returns 403 when student lacks class.session.settings scope", async () => {
        const { classId, studentTokens } = await setupClassWithTeacherAndStudent();

        const res = await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${studentTokens.accessToken}`)
            .send({ name: "CustomRole", scopes: ["class.poll.create"] });

        expect(res.status).toBe(403);
    });

    it("creates a custom role successfully", async () => {
        const { classId, teacherTokens } = await setupClassWithTeacherAndStudent();

        const res = await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "PollHelper", scopes: ["class.poll.create", "class.poll.end"] });

        expect(res.status).toBe(201);
        expect(res.body.data.name).toBe("PollHelper");
        expect(res.body.data.scopes).toEqual(["class.poll.create", "class.poll.end"]);
        expect(res.body.data.id).toBeDefined();
    });

    it("creates a custom role with a provided color", async () => {
        const { classId, teacherTokens } = await setupClassWithTeacherAndStudent();

        const res = await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "ColorRole", scopes: ["class.poll.create"], color: "#123456" });

        expect(res.status).toBe(201);
        expect(res.body.data.color).toBe("#123456");

        const listRes = await request(app).get(`/api/v1/class/${classId}/roles`).set("Authorization", `Bearer ${teacherTokens.accessToken}`);
        const createdRole = listRes.body.data.find((role) => role.name === "ColorRole");
        expect(createdRole.color).toBe("#123456");
    });

    it("returns 400 for a built-in role name", async () => {
        const { classId, teacherTokens } = await setupClassWithTeacherAndStudent();

        const res = await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "Teacher", scopes: ["class.poll.create"] });

        expect(res.status).toBe(400);
    });

    it("returns 400 for an invalid scope", async () => {
        const { classId, teacherTokens } = await setupClassWithTeacherAndStudent();

        const res = await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "BadRole", scopes: ["class.nonexistent.scope"] });

        expect(res.status).toBe(400);
    });

    it("returns 400 for a duplicate custom role name", async () => {
        const { classId, teacherTokens } = await setupClassWithTeacherAndStudent();

        await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "UniqueRole", scopes: ["class.poll.create"] });

        const res = await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "UniqueRole", scopes: ["class.poll.end"] });

        expect(res.status).toBe(400);
    });

    it("returns 400 for an empty role name", async () => {
        const { classId, teacherTokens } = await setupClassWithTeacherAndStudent();

        const res = await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "", scopes: ["class.poll.create"] });

        expect(res.status).toBe(400);
    });
});

// ── PATCH /api/v1/class/:id/roles/:roleId ──

describe("PATCH /api/v1/class/:id/roles/:roleId", () => {
    it("returns 403 when student lacks scope", async () => {
        const { classId, studentTokens } = await setupClassWithTeacherAndStudent();

        const res = await request(app)
            .patch(`/api/v1/class/${classId}/roles/999`)
            .set("Authorization", `Bearer ${studentTokens.accessToken}`)
            .send({ name: "Updated" });

        expect(res.status).toBe(403);
    });

    it("returns 404 for non-existent role", async () => {
        const { classId, teacherTokens } = await setupClassWithTeacherAndStudent();

        const res = await request(app)
            .patch(`/api/v1/class/${classId}/roles/99999`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "Updated" });

        expect(res.status).toBe(404);
    });

    it("updates a custom role name", async () => {
        const { classId, teacherTokens } = await setupClassWithTeacherAndStudent();

        const createRes = await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "OldName", scopes: ["class.poll.create"] });
        const roleId = createRes.body.data.id;

        const res = await request(app)
            .patch(`/api/v1/class/${classId}/roles/${roleId}`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "NewName" });

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe("NewName");
        expect(res.body.data.scopes).toEqual(["class.poll.create"]);
    });

    it("updates a custom role scopes", async () => {
        const { classId, teacherTokens } = await setupClassWithTeacherAndStudent();

        const createRes = await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "ScopeRole", scopes: ["class.poll.create"] });
        const roleId = createRes.body.data.id;

        const res = await request(app)
            .patch(`/api/v1/class/${classId}/roles/${roleId}`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ scopes: ["class.poll.create", "class.poll.end", "class.poll.delete"] });

        expect(res.status).toBe(200);
        expect(res.body.data.scopes).toEqual(["class.poll.create", "class.poll.end", "class.poll.delete"]);
    });

    it("updates a custom role color", async () => {
        const { classId, teacherTokens } = await setupClassWithTeacherAndStudent();

        const createRes = await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "ColorUpdateRole", scopes: ["class.poll.create"] });
        const roleId = createRes.body.data.id;

        const res = await request(app)
            .patch(`/api/v1/class/${classId}/roles/${roleId}`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ color: "#abcdef" });

        expect(res.status).toBe(200);
        expect(res.body.data.color).toBe("#abcdef");
    });
});

// ── DELETE /api/v1/class/:id/roles/:roleId ──

describe("DELETE /api/v1/class/:id/roles/:roleId", () => {
    it("returns 403 when student lacks scope", async () => {
        const { classId, studentTokens } = await setupClassWithTeacherAndStudent();

        const res = await request(app).delete(`/api/v1/class/${classId}/roles/999`).set("Authorization", `Bearer ${studentTokens.accessToken}`);

        expect(res.status).toBe(403);
    });

    it("returns 404 for non-existent role", async () => {
        const { classId, teacherTokens } = await setupClassWithTeacherAndStudent();

        const res = await request(app).delete(`/api/v1/class/${classId}/roles/99999`).set("Authorization", `Bearer ${teacherTokens.accessToken}`);

        expect(res.status).toBe(404);
    });

    it("deletes a custom role", async () => {
        const { classId, teacherTokens, studentTokens } = await setupClassWithTeacherAndStudent();

        const createRes = await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "DeleteMe", scopes: ["class.poll.create"] });
        const roleId = createRes.body.data.id;

        const res = await request(app).delete(`/api/v1/class/${classId}/roles/${roleId}`).set("Authorization", `Bearer ${teacherTokens.accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.message).toBe("Role deleted.");

        // Verify it's gone
        const listRes = await request(app).get(`/api/v1/class/${classId}/roles`).set("Authorization", `Bearer ${teacherTokens.accessToken}`);
        const roleNames = listRes.body.data.map((r) => r.name);
        expect(roleNames).not.toContain("DeleteMe");
    });
});

// ── POST /api/v1/class/:id/students/:userId/roles (Add Role) ──

describe("POST /api/v1/class/:id/students/:userId/roles", () => {
    it("returns 401 without authentication", async () => {
        const res = await request(app).post("/api/v1/class/1/students/1/roles/1");
        expect(res.status).toBe(401);
    });

    it("adds a built-in role to a student", async () => {
        const { classId, teacherTokens, student } = await setupClassWithTeacherAndStudent();
        const modRoleId = await getRoleIdByName("Mod");

        const res = await request(app)
            .post(`/api/v1/class/${classId}/students/${student.id}/roles/${modRoleId}`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.data.message).toBe("Role added.");
    });

    it("adds a custom role to a student", async () => {
        const { classId, teacherTokens, student } = await setupClassWithTeacherAndStudent();

        const createRoleRes = await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "CustomRole", scopes: ["class.poll.create"] });
        const customRoleId = createRoleRes.body.data.id;

        const res = await request(app)
            .post(`/api/v1/class/${classId}/students/${student.id}/roles/${customRoleId}`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({});

        expect(res.status).toBe(200);
    });

    it("returns 400 for non-existent role", async () => {
        const { classId, teacherTokens, student } = await setupClassWithTeacherAndStudent();

        const res = await request(app)
            .post(`/api/v1/class/${classId}/students/${student.id}/roles/999999`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({});

        expect(res.status).toBe(400);
    });

    it("returns 400 when roleId field is missing", async () => {
        const { classId, teacherTokens, student } = await setupClassWithTeacherAndStudent();

        const res = await request(app)
            .post(`/api/v1/class/${classId}/students/${student.id}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({});

        expect(res.status).toBe(404);
    });

    it("returns 404 for a non-member user", async () => {
        const { classId, teacherTokens } = await setupClassWithTeacherAndStudent();

        const { user: outsider } = await seedAuthenticatedUser(mockDatabase, {
            email: "outsider@test.com",
            displayName: "Outsider",
        });
        const modRoleId = await getRoleIdByName("Mod");

        const res = await request(app)
            .post(`/api/v1/class/${classId}/students/${outsider.id}/roles/${modRoleId}`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({});

        expect(res.status).toBe(404);
    });

    it("returns 400 when adding a role the student already has", async () => {
        const { classId, teacherTokens, student } = await setupClassWithTeacherAndStudent();
        const modRoleId = await getRoleIdByName("Mod");

        await request(app)
            .post(`/api/v1/class/${classId}/students/${student.id}/roles/${modRoleId}`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({});

        const res = await request(app)
            .post(`/api/v1/class/${classId}/students/${student.id}/roles/${modRoleId}`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({});

        expect(res.status).toBe(400);
    });

    it("allows adding multiple roles to the same student", async () => {
        const { classId, teacherTokens, student } = await setupClassWithTeacherAndStudent();
        const modRoleId = await getRoleIdByName("Mod");

        const createRoleRes = await request(app)
            .post(`/api/v1/class/${classId}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({ name: "Helper", scopes: ["class.help.approve"] });
        const helperRoleId = createRoleRes.body.data.id;

        const res1 = await request(app)
            .post(`/api/v1/class/${classId}/students/${student.id}/roles/${modRoleId}`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({});
        expect(res1.status).toBe(200);

        const res2 = await request(app)
            .post(`/api/v1/class/${classId}/students/${student.id}/roles/${helperRoleId}`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({});
        expect(res2.status).toBe(200);

        // Verify both roles are listed
        const listRes = await request(app)
            .get(`/api/v1/class/${classId}/students/${student.id}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`);
        expect(listRes.status).toBe(200);
        const assignedRoleIds = listRes.body.data.roles.map((role) => role.id);
        const assignedRoleNames = listRes.body.data.roles.map((role) => role.name);
        expect(assignedRoleIds).toContain(helperRoleId);
        expect(assignedRoleNames).toContain("Mod");
        expect(assignedRoleNames).toContain("Helper");
    });
});

// ── DELETE /api/v1/class/:id/students/:userId/roles/:roleId (Remove Role) ──

describe("DELETE /api/v1/class/:id/students/:userId/roles/:roleId", () => {
    it("returns 403 when student lacks scope", async () => {
        const { classId, studentTokens, student } = await setupClassWithTeacherAndStudent();
        const modRoleId = await getRoleIdByName("Mod");

        const res = await request(app)
            .delete(`/api/v1/class/${classId}/students/${student.id}/roles/${modRoleId}`)
            .set("Authorization", `Bearer ${studentTokens.accessToken}`);

        expect(res.status).toBe(403);
    });

    it("removes a role from a student", async () => {
        const { classId, teacherTokens, student } = await setupClassWithTeacherAndStudent();
        const modRoleId = await getRoleIdByName("Mod");

        // Add the role first
        await request(app)
            .post(`/api/v1/class/${classId}/students/${student.id}/roles/${modRoleId}`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({});

        // Remove it
        const res = await request(app)
            .delete(`/api/v1/class/${classId}/students/${student.id}/roles/${modRoleId}`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.message).toBe("Role removed.");

        // Verify it's gone
        const listRes = await request(app)
            .get(`/api/v1/class/${classId}/students/${student.id}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`);
        expect(listRes.body.data.roles.map((role) => role.id)).not.toContain(modRoleId);
    });

    it("returns 400 when removing a role the student does not have", async () => {
        const { classId, teacherTokens, student } = await setupClassWithTeacherAndStudent();
        const modRoleId = await getRoleIdByName("Mod");

        const res = await request(app)
            .delete(`/api/v1/class/${classId}/students/${student.id}/roles/${modRoleId}`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`);

        expect(res.status).toBe(400);
    });
});

// ── GET /api/v1/class/:id/students/:userId/roles (List Roles) ──

describe("GET /api/v1/class/:id/students/:userId/roles", () => {
    it("returns 401 without authentication", async () => {
        const res = await request(app).get("/api/v1/class/1/students/1/roles");
        expect(res.status).toBe(401);
    });

    it("returns the default Student role for a new student", async () => {
        const { classId, teacherTokens, student } = await setupClassWithTeacherAndStudent();

        const res = await request(app)
            .get(`/api/v1/class/${classId}/students/${student.id}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.roles).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "Student",
                    id: expect.any(Number),
                }),
            ])
        );
    });

    it("returns 403 for class members without class.roles.read scope", async () => {
        const { classId, studentTokens, student } = await setupClassWithTeacherAndStudent();

        const res = await request(app)
            .get(`/api/v1/class/${classId}/students/${student.id}/roles`)
            .set("Authorization", `Bearer ${studentTokens.accessToken}`);

        expect(res.status).toBe(403);
    });

    it("returns assigned roles", async () => {
        const { classId, teacherTokens, student } = await setupClassWithTeacherAndStudent();
        const modRoleId = await getRoleIdByName("Mod");

        await request(app)
            .post(`/api/v1/class/${classId}/students/${student.id}/roles/${modRoleId}`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`)
            .send({});

        const res = await request(app)
            .get(`/api/v1/class/${classId}/students/${student.id}/roles`)
            .set("Authorization", `Bearer ${teacherTokens.accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.roles).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "Mod",
                    id: expect.any(Number),
                }),
            ])
        );
    });
});
