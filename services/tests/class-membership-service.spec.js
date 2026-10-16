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

jest.mock("@services/socket-updates-service", () => ({
    advancedEmitToClass: jest.fn(),
    emitToUser: jest.fn(),
    invalidateClassPollCache: jest.fn(),
}));

jest.mock("@services/role-service", () => ({
    findRoleByPermissionLevel: jest.fn(),
}));

const mockClassrooms = {};
jest.mock("@services/classroom-service", () => ({
    classStateStore: {
        getClassroom: jest.fn((id) => mockClassrooms[id] || null),
        getClassroomStudent: jest.fn(),
        updateClassroomStudent: jest.fn(),
        removeClassroomStudent: jest.fn(),
        updateUser: jest.fn(),
    },
    getClassIDFromCode: jest.fn(async (code) => {
        const row = await mockDatabase.dbGet("SELECT id FROM classroom WHERE key = ?", [code]);
        return row ? row.id : null;
    }),
}));

jest.mock("@stores/class-code-cache-store", () => ({
    classCodeCacheStore: {
        invalidateByClassId: jest.fn(),
    },
}));

jest.mock("@services/class-service", () => ({
    initializeClassroom: jest.fn(),
    addUserToClassroomSession: jest.fn(() => true),
    applyDefaultEnrollmentRole: jest.fn(),
    endClass: jest.fn(),
    classKickStudent: jest.fn(),
}));

jest.mock("@services/student-service", () => ({
    getIdFromEmail: jest.fn(() => 1),
    getEmailFromId: jest.fn(() => "student@test.com"),
}));

jest.mock("../../sockets/init", () => ({
    userSocketUpdates: new Map(),
}));

const {
    deleteClassroom,
    getClassroomById,
    classroomOwnerCheck,
    setClassroomBanStatus,
    enrollByCode,
    enrollInClass,
    unenrollFromClass,
    isUserEnrolled,
    getClassLinks,
    getClassLinksPaginated,
} = require("@services/class-membership-service");
const { emitToUser, advancedEmitToClass } = require("@services/socket-updates-service");
const { classStateStore } = require("@services/classroom-service");
const classService = require("@services/class-service");
const { findRoleByPermissionLevel } = require("@services/role-service");
const { getIdFromEmail, getEmailFromId } = require("@services/student-service");
const { userSocketUpdates } = require("../../sockets/init");
const { BANNED_PERMISSIONS, SCOPES } = require("@modules/permissions");
const AppError = require("@errors/app-error");
const NotFoundError = require("@errors/not-found-error");

async function seedClassroom(overrides = {}) {
    const defaults = { name: "Test Class", owner: 1, key: "ABC123" };
    const c = { ...defaults, ...overrides };
    const id = await mockDatabase.dbRun("INSERT INTO classroom (name, owner, key) VALUES (?, ?, ?)", [c.name, c.owner, c.key]);
    return { id, ...c };
}

async function seedClassUser(classId, studentId, overrides = {}) {
    const defaults = { digiPogs: 0 };
    const u = { ...defaults, ...overrides };
    await mockDatabase.dbRun("INSERT INTO classusers (classId, studentId, digiPogs) VALUES (?, ?, ?)", [classId, studentId, u.digiPogs]);
}

async function seedLink(classId, name, url) {
    await mockDatabase.dbRun("INSERT INTO links (name, url, classId) VALUES (?, ?, ?)", [name, url, classId]);
}

beforeAll(async () => {
    mockDatabase = await createTestDb();
});

afterEach(async () => {
    await mockDatabase.reset();
    jest.clearAllMocks();
    Object.keys(mockClassrooms).forEach((k) => delete mockClassrooms[k]);
});

afterAll(async () => {
    await mockDatabase.close();
});

describe("deleteClassroom", () => {
    it("deletes classroom and classusers rows", async () => {
        const room = await seedClassroom();
        await seedClassUser(room.id, 1);
        await seedClassUser(room.id, 2);

        await deleteClassroom(room.id);

        const classroom = await mockDatabase.dbGet("SELECT * FROM classroom WHERE id=?", [room.id]);
        const users = await mockDatabase.dbGetAll("SELECT * FROM classusers WHERE classId=?", [room.id]);
        expect(classroom).toBeUndefined();
        expect(users).toEqual([]);
    });

    it("deletes dependent poll and custom poll rows before removing source rows", async () => {
        const room = await seedClassroom();
        await seedClassUser(room.id, 1);
        await seedClassUser(room.id, 2);
        const pollId = await mockDatabase.dbRun("INSERT INTO poll_history (class, prompt, responses, createdAt) VALUES (?, ?, ?, ?)", [
            room.id,
            "Exit?",
            "[]",
            Date.now(),
        ]);
        await mockDatabase.dbRun("INSERT INTO poll_answers (pollId, classId, userId, buttonResponse, textResponse) VALUES (?, ?, ?, ?, ?)", [
            pollId,
            room.id,
            2,
            "A",
            null,
        ]);
        await mockDatabase.dbRun("INSERT INTO shared_polls (pollId, userId) VALUES (?, ?)", [pollId, 2]);
        const customPollId = await mockDatabase.dbRun("INSERT INTO custom_polls (owner, name, prompt, answers) VALUES (?, ?, ?, ?)", [
            2,
            "Exit Ticket",
            "Done?",
            "[]",
        ]);

        await deleteClassroom(room.id);

        expect(await mockDatabase.dbGet("SELECT * FROM poll_history WHERE id=?", [pollId])).toBeUndefined();
        expect(await mockDatabase.dbGet("SELECT * FROM poll_answers WHERE pollId=?", [pollId])).toBeUndefined();
        expect(await mockDatabase.dbGet("SELECT * FROM shared_polls WHERE pollId=?", [pollId])).toBeUndefined();
        expect(await mockDatabase.dbGet("SELECT * FROM custom_polls WHERE id=?", [customPollId])).toBeUndefined();
    });

    it("throws AppError when classroomId is null", async () => {
        await expect(deleteClassroom(null)).rejects.toThrow(AppError);
    });

    it("throws AppError when classroomId is undefined", async () => {
        await expect(deleteClassroom(undefined)).rejects.toThrow(AppError);
    });
});

describe("getClassroomById", () => {
    it("returns classroom row when found", async () => {
        const room = await seedClassroom({ name: "My Room", key: "XYZ789" });

        const result = await getClassroomById(room.id);

        expect(result).toMatchObject({ id: room.id, name: "My Room", key: "XYZ789", owner: 1 });
    });

    it("returns undefined for non-existent id", async () => {
        const result = await getClassroomById(9999);
        expect(result).toBeUndefined();
    });

    it("throws AppError when classroomId is null", () => {
        expect(() => getClassroomById(null)).toThrow(AppError);
    });
});

describe("classroomOwnerCheck", () => {
    it("returns true when user is the owner", async () => {
        const room = await seedClassroom({ owner: 42 });
        const req = { params: { id: String(room.id) }, user: { id: 42 } };

        const result = await classroomOwnerCheck(req);

        expect(result).toBe(true);
        expect(req._room).toMatchObject({ id: room.id, owner: 42 });
    });

    it("returns false when user is not the owner", async () => {
        const room = await seedClassroom({ owner: 42 });
        const req = { params: { id: String(room.id) }, user: { id: 99 } };

        const result = await classroomOwnerCheck(req);

        expect(result).toBe(false);
    });

    it("throws NotFoundError for non-existent classroom", async () => {
        const req = { params: { id: "9999" }, user: { id: 1 } };

        await expect(classroomOwnerCheck(req)).rejects.toThrow(NotFoundError);
    });

    it("caches classroom on req._room", async () => {
        const room = await seedClassroom({ owner: 10 });
        const req = { params: { id: String(room.id) }, user: { id: 10 } };

        await classroomOwnerCheck(req);

        expect(req._room).toBeDefined();
        expect(req._room.id).toBe(room.id);
        expect(req._room.name).toBe("Test Class");
    });
});

describe("isUserEnrolled", () => {
    it("returns true when user is in class", async () => {
        const room = await seedClassroom();
        await seedClassUser(room.id, 5);

        const result = await isUserEnrolled(5, room.id);
        expect(result).toBe(true);
    });

    it("returns false when user is not in class", async () => {
        const room = await seedClassroom();

        const result = await isUserEnrolled(5, room.id);
        expect(result).toBe(false);
    });

    it("returns false for non-existent class", async () => {
        const result = await isUserEnrolled(1, 9999);
        expect(result).toBe(false);
    });
});

describe("getClassLinks", () => {
    it("returns links for a class", async () => {
        const room = await seedClassroom();
        await seedLink(room.id, "Google", "https://google.com");
        await seedLink(room.id, "GitHub", "https://github.com");

        const links = await getClassLinks(room.id);

        expect(links).toHaveLength(2);
        expect(links).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: "Google", url: "https://google.com" }),
                expect.objectContaining({ name: "GitHub", url: "https://github.com" }),
            ])
        );
    });

    it("returns empty array when no links exist", async () => {
        const room = await seedClassroom();

        const links = await getClassLinks(room.id);
        expect(links).toEqual([]);
    });

    it("throws AppError when classId is null", () => {
        expect(() => getClassLinks(null)).toThrow(AppError);
    });
});

describe("getClassLinksPaginated", () => {
    it("returns links ordered by id with pagination metadata", async () => {
        const room = await seedClassroom();
        await seedLink(room.id, "Alpha", "https://alpha.example");
        await seedLink(room.id, "Beta", "https://beta.example");
        await seedLink(room.id, "Gamma", "https://gamma.example");

        const result = await getClassLinksPaginated(room.id, 2, 1);

        expect(result.total).toBe(3);
        expect(result.links).toHaveLength(2);
        expect(result.links[0]).toMatchObject({ name: "Beta" });
        expect(result.links[1]).toMatchObject({ name: "Gamma" });
    });

    it("returns an empty page when the class has no links", async () => {
        const room = await seedClassroom();
        const result = await getClassLinksPaginated(room.id, 10, 0);
        expect(result).toEqual({ links: [], total: 0 });
    });
});

describe("setClassroomBanStatus", () => {
    it("throws NotFoundError when user does not exist", async () => {
        getEmailFromId.mockResolvedValueOnce(null);

        await expect(setClassroomBanStatus(10, 5, true)).rejects.toThrow(NotFoundError);

        expect(findRoleByPermissionLevel).not.toHaveBeenCalled();
        expect(classService.classKickStudent).not.toHaveBeenCalled();
    });

    it("applies banned role, updates active student roles, and kicks user", async () => {
        const room = await seedClassroom();
        const bannedRole = { id: 9, name: "Banned", scopes: [SCOPES.CLASS.SYSTEM.BLOCKED] };
        await mockDatabase.dbRun("INSERT INTO roles (id, name, isDefault, scopes) VALUES (?, ?, ?, ?)", [
            bannedRole.id,
            bannedRole.name,
            0,
            JSON.stringify(bannedRole.scopes),
        ]);
        await mockDatabase.dbRun("INSERT INTO user_roles (userId, roleId, classId) VALUES (?, ?, ?)", [1, 2, room.id]);
        findRoleByPermissionLevel.mockResolvedValueOnce(bannedRole);
        classStateStore.getClassroomStudent.mockReturnValueOnce({
            roles: { global: [{ id: 100, name: "Student" }], class: [] },
        });
        mockClassrooms[room.id] = {
            id: room.id,
            availableRoles: [{ id: 8, name: "Blocked Alias", scopes: [SCOPES.CLASS.SYSTEM.BLOCKED] }],
        };

        const result = await setClassroomBanStatus(room.id, 1, true);

        const roles = await mockDatabase.dbGetAll("SELECT userId, roleId, classId FROM user_roles WHERE userId=? AND classId=?", [1, room.id]);
        expect(result).toBe(true);
        expect(findRoleByPermissionLevel).toHaveBeenCalledWith(BANNED_PERMISSIONS, room.id);
        expect(roles).toEqual([{ userId: 1, roleId: 9, classId: room.id }]);
        expect(classStateStore.updateClassroomStudent).toHaveBeenCalledWith(room.id, "student@test.com", {
            roles: {
                global: [{ id: 100, name: "Student" }],
                class: [{ id: 8, name: "Blocked Alias" }],
            },
        });
        expect(classService.classKickStudent).toHaveBeenCalledWith(1, room.id, { exitRoom: true, ban: true });
    });

    it("removes class role and clears active class roles when unbanning", async () => {
        const room = await seedClassroom();
        await mockDatabase.dbRun("INSERT INTO user_roles (userId, roleId, classId) VALUES (?, ?, ?)", [1, 1, room.id]);
        classStateStore.getClassroomStudent.mockReturnValueOnce({
            roles: { global: [{ id: 3, name: "Mod" }], class: [{ id: 1, name: "Banned" }] },
        });

        const result = await setClassroomBanStatus(room.id, 1, false);

        const roles = await mockDatabase.dbGetAll("SELECT userId, roleId, classId FROM user_roles WHERE userId=? AND classId=?", [1, room.id]);
        expect(result).toBe(true);
        expect(roles).toEqual([]);
        expect(classStateStore.updateClassroomStudent).toHaveBeenCalledWith(room.id, "student@test.com", {
            roles: {
                global: [{ id: 3, name: "Mod" }],
                class: [],
            },
        });
        expect(classService.classKickStudent).toHaveBeenCalledWith(1, room.id, { exitRoom: true, ban: false });
    });

    it("throws AppError when classroomId or userId are missing", async () => {
        await expect(setClassroomBanStatus(null, 1, true)).rejects.toThrow(AppError);
        await expect(setClassroomBanStatus(1, null, true)).rejects.toThrow(AppError);
    });
});

describe("enrollByCode", () => {
    it("delegates to class-service on happy path", async () => {
        const room = await seedClassroom({ key: "JOIN1" });
        mockClassrooms[room.id] = { id: room.id };
        const sessionUser = { email: "test@example.com" };

        const result = await enrollByCode("JOIN1", sessionUser);

        expect(result).toEqual({ success: true, roomId: room.id });
        expect(classService.addUserToClassroomSession).toHaveBeenCalledWith(room.id, "test@example.com", sessionUser);
        expect(classService.initializeClassroom).not.toHaveBeenCalled();
    });

    it("initializes classroom when not in memory", async () => {
        const room = await seedClassroom({ key: "INIT1" });
        const sessionUser = { email: "test@example.com" };

        await enrollByCode("INIT1", sessionUser);

        expect(classService.initializeClassroom).toHaveBeenCalledWith(room.id);
    });

    it("throws NotFoundError for invalid code", async () => {
        const sessionUser = { email: "test@example.com" };

        await expect(enrollByCode("BADCODE", sessionUser)).rejects.toThrow(NotFoundError);
    });

    it("returns success false when addUserToClassroomSession returns falsy", async () => {
        const room = await seedClassroom({ key: "FAIL1" });
        mockClassrooms[room.id] = { id: room.id };
        classService.addUserToClassroomSession.mockResolvedValueOnce(false);

        const result = await enrollByCode("FAIL1", { email: "test@example.com" });

        expect(result).toEqual({ success: false });
    });
});

describe("enrollInClass", () => {
    it("wraps enrollByCode and emits to user", async () => {
        const room = await seedClassroom({ key: "EMIT1" });
        mockClassrooms[room.id] = { id: room.id };
        const userSession = { email: "user@test.com" };

        const result = await enrollInClass(userSession, "EMIT1");

        expect(result).toEqual({ success: true, roomId: room.id });
        expect(emitToUser).toHaveBeenCalledWith("user@test.com", "joinClass", { success: true, roomId: room.id });
    });

    it("propagates NotFoundError from enrollByCode", async () => {
        const userSession = { email: "user@test.com" };

        await expect(enrollInClass(userSession, "NOPE")).rejects.toThrow(NotFoundError);
    });
});

describe("unenrollFromClass", () => {
    it("removes user from class and database", async () => {
        const room = await seedClassroom({ owner: 99 });
        await seedClassUser(room.id, 1);
        getIdFromEmail.mockResolvedValueOnce(1);

        await unenrollFromClass({ classId: room.id, email: "student@test.com" });

        expect(classStateStore.removeClassroomStudent).toHaveBeenCalledWith(room.id, "student@test.com");
        expect(classStateStore.updateUser).toHaveBeenCalledWith("student@test.com", {
            activeClass: null,
            break: false,
            help: false,
        });

        const row = await mockDatabase.dbGet("SELECT * FROM classusers WHERE classId=? AND studentId=?", [room.id, 1]);
        expect(row).toBeUndefined();
    });

    it("deletes classroom when owner leaves", async () => {
        const room = await seedClassroom({ owner: 1 });
        await seedClassUser(room.id, 1);
        getIdFromEmail.mockResolvedValueOnce(1);

        await unenrollFromClass({ classId: room.id, email: "owner@test.com" });

        const classroom = await mockDatabase.dbGet("SELECT * FROM classroom WHERE id=?", [room.id]);
        expect(classroom).toBeUndefined();
    });

    it("does not delete classroom when non-owner leaves", async () => {
        const room = await seedClassroom({ owner: 99 });
        await seedClassUser(room.id, 1);
        getIdFromEmail.mockResolvedValueOnce(1);

        await unenrollFromClass({ classId: room.id, email: "student@test.com" });

        const classroom = await mockDatabase.dbGet("SELECT * FROM classroom WHERE id=?", [room.id]);
        expect(classroom).toBeDefined();
    });

    it("emits leaveSound and reload events", async () => {
        const room = await seedClassroom({ owner: 99 });
        await seedClassUser(room.id, 1);
        getIdFromEmail.mockResolvedValueOnce(1);

        await unenrollFromClass({ classId: room.id, email: "student@test.com" });

        expect(advancedEmitToClass).toHaveBeenCalledWith("leaveSound", room.id, {});
        expect(emitToUser).toHaveBeenCalledWith("student@test.com", "reload");
    });

    it("calls classUpdate on user sockets if present", async () => {
        const room = await seedClassroom({ owner: 99 });
        await seedClassUser(room.id, 1);
        getIdFromEmail.mockResolvedValueOnce(1);

        const mockSocketUpdate = { classUpdate: jest.fn() };
        userSocketUpdates.set("student@test.com", new Map([["sock1", mockSocketUpdate]]));

        await unenrollFromClass({ classId: room.id, email: "student@test.com" });

        expect(mockSocketUpdate.classUpdate).toHaveBeenCalledWith(room.id);
        userSocketUpdates.delete("student@test.com");
    });
});
