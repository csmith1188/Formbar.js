/**
 * Unit tests for services/class-service.js
 *
 * Focuses on:
 *  - Pure helper functions (validateClassroomName, normalizeClassroomData)
 *  - Database-only read functions (getClassCode, getUserJoinedClasses)
 *  - createClass (DB + in-memory state; no socket emissions at creation time)
 *
 * Note: getClassIdByCode was removed in favor of getClassIDFromCode from
 * classroom-service (which includes caching). See classroom-service tests.
 *
 * Functions that emit socket events (startClass, endClass, joinClass, etc.) are
 * *not* exercised here as they require a live socket server.
 *
 * Uses an in-memory SQLite database so no real DB file is touched.
 */
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

// manager-service is mocked globally by jest.setup.js; that is fine here since
// class-service delegates to it only via socket-updates-service which we don't
// exercise in these tests.

const {
    validateClassroomName,
    createClass,
    initializeClassroom,
    getClassCode,
    getUserJoinedClasses,
    getTimer,
    startTimer,
    endTimer,
    clearTimer,
    pauseTimer,
    resumeTimer,
    classKickStudent,
    addUserToClassroomSession,
    applyDefaultEnrollmentRole,
    updateClassSetting,
} = require("@services/class-service");

const { classStateStore } = require("@services/classroom-service");

beforeAll(async () => {
    mockDatabase = await createTestDb();
});

afterEach(async () => {
    await mockDatabase.reset();
    // Wipe in-memory class state so tests don't bleed into each other
    classStateStore._state = { users: {}, classrooms: {} };
    // Clear code → id cache
    const { classCodeCacheStore } = require("@stores/class-code-cache-store");
    classCodeCacheStore.clear();
});

afterAll(async () => {
    await mockDatabase.close();
});

const crypto = require("crypto");

async function seedUser(email = "owner@example.com", displayName = "Owner") {
    const id = await mockDatabase.dbRun("INSERT INTO users (email, password, API, secret, displayName, verified) VALUES (?, ?, ?, ?, ?, ?)", [
        email,
        "hashed",
        crypto.randomBytes(8).toString("hex"),
        crypto.randomBytes(8).toString("hex"),
        displayName,
        1,
    ]);
    // Assign Teacher role (id=5) by default
    await mockDatabase.dbRun("INSERT INTO user_roles (userId, roleId, classId) VALUES (?, ?, NULL)", [id, 5]);
    return { id, email, displayName };
}

async function seedClassroom({ name = "Test Class", ownerId = 1, key = 1234 } = {}) {
    const id = await mockDatabase.dbRun("INSERT INTO classroom (name, owner, key) VALUES (?, ?, ?)", [name, ownerId, key]);
    return { id, name, ownerId, key };
}

describe("validateClassroomName()", () => {
    it("returns { valid: true } for a normal classroom name", () => {
        expect(validateClassroomName("Intro to CS")).toEqual({ valid: true });
    });

    it("accepts names with allowed special characters (- _ . ' ( ) & ,)", () => {
        expect(validateClassroomName("Mrs. Smith's Class")).toEqual({ valid: true });
        expect(validateClassroomName("Period 1 - Math")).toEqual({ valid: true });
        expect(validateClassroomName("Science & Tech")).toEqual({ valid: true });
    });

    it("rejects a name shorter than 3 characters", () => {
        const result = validateClassroomName("AB");
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/3 characters/i);
    });

    it("rejects a name longer than 30 characters", () => {
        const result = validateClassroomName("A".repeat(31));
        expect(result.valid).toBe(false);
    });

    it("rejects an empty string", () => {
        const result = validateClassroomName("");
        expect(result.valid).toBe(false);
    });

    it("rejects null", () => {
        const result = validateClassroomName(null);
        expect(result.valid).toBe(false);
    });

    it("rejects undefined", () => {
        const result = validateClassroomName(undefined);
        expect(result.valid).toBe(false);
    });

    it("rejects names with consecutive spaces", () => {
        const result = validateClassroomName("Class  Name");
        expect(result.valid).toBe(false);
    });

    it("rejects names with disallowed characters (e.g. @)", () => {
        const result = validateClassroomName("Bad@Name");
        expect(result.valid).toBe(false);
    });
});

describe("getClassCode()", () => {
    it("returns the class code for a valid class id", async () => {
        const { id, key } = await seedClassroom({ key: 5678 });
        const result = await getClassCode(id);
        expect(result).toBe(5678);
    });

    it("returns null for a non-existent class id", async () => {
        const result = await getClassCode(99999);
        expect(result).toBeNull();
    });
});

describe("getUserJoinedClasses()", () => {
    it("returns an empty array when the user has not joined any classes", async () => {
        const result = await getUserJoinedClasses(999);
        expect(result).toEqual([]);
    });

    it("returns joined classes with name and id", async () => {
        const owner = await seedUser();
        const { id: classId } = await seedClassroom({ ownerId: owner.id, name: "Biology" });
        await mockDatabase.dbRun("INSERT INTO classusers (classId, studentId, digiPogs) VALUES (?, ?, ?)", [classId, owner.id, 0]);

        const result = await getUserJoinedClasses(owner.id);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("Biology");
        expect(result[0].id).toBe(classId);
    });

    it("does not return classes the user has not joined", async () => {
        const owner = await seedUser("owner2@example.com", "Owner2");
        await seedClassroom({ ownerId: owner.id, name: "Physics" }); // no classusers entry
        const result = await getUserJoinedClasses(owner.id);
        expect(result).toHaveLength(0);
    });
});

describe("createClass()", () => {
    it("creates a classroom row in the database", async () => {
        const owner = await seedUser();
        await createClass("New Class", owner.id, owner.email);

        const rows = await mockDatabase.dbGetAll("SELECT * FROM classroom");
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe("New Class");
        expect(rows[0].owner).toBe(owner.id);
    });

    it("seeds class-scoped default roles for the new classroom", async () => {
        const owner = await seedUser();
        const result = await createClass("Seeded Class", owner.id, owner.email);

        const classRoles = await mockDatabase.dbGetAll(
            `SELECT r.name
             FROM class_roles cr
             JOIN roles r ON r.id = cr.roleId
             WHERE cr.classId = ?
             ORDER BY cr.orderIndex IS NULL, cr.orderIndex, r.id`,
            [result.classId]
        );

        expect(classRoles.map((role) => role.name)).toEqual(["Manager", "Teacher", "Mod", "Student", "Guest", "Banned"]);
    });

    it("returns classId, key, and className", async () => {
        const owner = await seedUser();
        const result = await createClass("My Class", owner.id, owner.email);

        expect(result).toHaveProperty("classId");
        expect(result).toHaveProperty("key");
        expect(result).toHaveProperty("className", "My Class");
    });

    it("initialises the class in the in-memory classStateStore", async () => {
        const owner = await seedUser();
        const result = await createClass("State Class", owner.id, owner.email);

        const classroom = classStateStore.getClassroom(result.classId);
        expect(classroom).toBeDefined();
        expect(classroom.className).toBe("State Class");
    });

    it("throws ValidationError for an invalid classroom name", async () => {
        const owner = await seedUser();
        await expect(createClass("AB", owner.id, owner.email)).rejects.toThrow(/classroom name/i);
    });

    it("throws ValidationError for an empty classroom name", async () => {
        const owner = await seedUser();
        await expect(createClass("", owner.id, owner.email)).rejects.toThrow();
    });
});

describe("initializeClassroom()", () => {
    it("does not recreate default roles for a classroom with none", async () => {
        const owner = await seedUser();
        const { id: classId } = await seedClassroom({ ownerId: owner.id, name: "Legacyless Class" });

        await initializeClassroom(classId);

        const classroom = classStateStore.getClassroom(classId);
        const classRoles = await mockDatabase.dbGetAll("SELECT roleId FROM class_roles WHERE classId = ?", [classId]);

        expect(classroom.availableRoles).toEqual([]);
        expect(classRoles).toEqual([]);
    });
});

describe("getTimer()", () => {
    it("returns undefined when the classroom does not exist", () => {
        expect(getTimer(999)).toBeUndefined();
    });

    it("returns undefined when the classroom has no timer set", () => {
        classStateStore.setClassroom(1, { className: "Test" });
        expect(getTimer(1)).toBeUndefined();
    });

    it("returns the timer object when set", () => {
        const timer = { startTime: 1000, endTime: 2000, active: true, sound: false };
        classStateStore.setClassroom(1, { className: "Test", timer });
        expect(getTimer(1)).toEqual(timer);
    });
});

describe("classKickStudent()", () => {
    it("throws when the target is no longer in the class", async () => {
        const teacher = await seedUser("teacher-kick@example.com", "Teacher Kick");
        const student = await seedUser("student-kick@example.com", "Student Kick");
        const { id: classId } = await seedClassroom({ ownerId: teacher.id, name: "Kick Guard Class" });

        await expect(classKickStudent(student.id, classId)).rejects.toThrow(/not in the specified class/i);
    });

    it("clears class role assignments before a kicked user can rejoin", async () => {
        const teacher = await seedUser("teacher-role-kick@example.com", "Teacher Role Kick");
        const student = await seedUser("student-role-kick@example.com", "Student Role Kick");
        const { id: classId } = await seedClassroom({ ownerId: teacher.id, name: "Role Kick Class" });
        const role = await mockDatabase.dbGet("SELECT id FROM roles WHERE name = ? LIMIT 1", ["Student"]);

        await mockDatabase.dbRun("INSERT INTO classusers (classId, studentId) VALUES (?, ?)", [classId, student.id]);
        await mockDatabase.dbRun("INSERT INTO user_roles (userId, roleId, classId) VALUES (?, ?, ?)", [student.id, role.id, classId]);

        await classKickStudent(student.id, classId);

        const assignments = await mockDatabase.dbGetAll("SELECT * FROM user_roles WHERE userId = ? AND classId = ?", [student.id, classId]);
        expect(assignments).toEqual([]);
    });
});

describe("default enrollment role", () => {
    it("assigns the configured role to a newly enrolled user", async () => {
        const owner = await seedUser("owner-default-role@example.com", "Default Role Owner");
        const student = await seedUser("student-default-role@example.com", "Default Role Student");
        const { classId } = await createClass("Default Role Class", owner.id, owner.email);
        const role = await mockDatabase.dbGet(
            `SELECT r.id
             FROM roles r
             JOIN class_roles cr ON cr.roleId = r.id
             WHERE r.name = ? AND cr.classId = ?`,
            ["Mod", classId]
        );

        await updateClassSetting(classId, { defaultRoleId: role.id });
        classStateStore.setUser(student.email, { id: student.id, email: student.email, roles: { global: [], class: [] } });

        await addUserToClassroomSession(classId, student.email, { email: student.email });
        expect(classStateStore.getUser(student.email).isOffline).toBe(false);
        expect(
            await mockDatabase.dbGet("SELECT roleId FROM user_roles WHERE userId = ? AND classId = ?", [student.id, classId])
        ).toBeUndefined();
        await applyDefaultEnrollmentRole(classId, student.id);

        const assignment = await mockDatabase.dbGet(
            "SELECT roleId FROM user_roles WHERE userId = ? AND classId = ?",
            [student.id, classId]
        );
        expect(assignment.roleId).toBe(role.id);
    });
});

describe("startTimer()", () => {
    it("does nothing when the classroom does not exist", () => {
        expect(() => startTimer({ classId: 999, duration: 5000 })).not.toThrow();
    });

    it("sets an active timer with the correct start and end times", () => {
        classStateStore.setClassroom(1, { className: "Test" });

        const before = Date.now();
        startTimer({ classId: 1, duration: 5000 });
        const after = Date.now();

        const timer = classStateStore.getClassroom(1).timer;
        expect(timer.active).toBe(true);
        expect(timer.startTime).toBeGreaterThanOrEqual(before);
        expect(timer.startTime).toBeLessThanOrEqual(after);
        expect(timer.endTime).toBe(timer.startTime + 5000);
    });

    it("sets sound to false when not provided", () => {
        classStateStore.setClassroom(1, { className: "Test" });
        startTimer({ classId: 1, duration: 1000 });

        expect(classStateStore.getClassroom(1).timer.sound).toBe(false);
    });

    it("sets sound when provided", () => {
        classStateStore.setClassroom(1, { className: "Test" });
        startTimer({ classId: 1, duration: 1000, sound: true });

        expect(classStateStore.getClassroom(1).timer.sound).toBe(true);
    });
});

describe("endTimer()", () => {
    it("does nothing when the classroom does not exist", () => {
        expect(() => endTimer(999)).not.toThrow();
    });

    it("sets active to false while preserving other timer fields", () => {
        classStateStore.setClassroom(1, {
            className: "Test",
            timer: { startTime: 1000, endTime: 6000, active: true, sound: true },
        });

        endTimer(1);

        const timer = classStateStore.getClassroom(1).timer;
        expect(timer.active).toBe(false);
        expect(timer.startTime).toBe(1000);
        expect(timer.endTime).toBe(6000);
        expect(timer.sound).toBe(true);
    });
});

describe("clearTimer()", () => {
    it("does nothing when the classroom does not exist", () => {
        expect(() => clearTimer(999)).not.toThrow();
    });

    it("resets the timer to zeroed-out inactive state", () => {
        classStateStore.setClassroom(1, {
            className: "Test",
            timer: { startTime: 1000, endTime: 6000, active: true, sound: true },
        });

        clearTimer(1);

        const timer = classStateStore.getClassroom(1).timer;
        expect(timer).toEqual({
            startTime: 0,
            endTime: 0,
            active: false,
            sound: false,
        });
    });
});

describe("pauseTimer()", () => {
    it("does nothing when the classroom does not exist", () => {
        expect(() => pauseTimer(999)).not.toThrow();
    });

    it("does nothing when the classroom has no timer", () => {
        classStateStore.setClassroom(1, { className: "Test" });
        pauseTimer(1);
        expect(classStateStore.getClassroom(1).timer).toBeUndefined();
    });

    it("sets active to false and records pausedAt", () => {
        classStateStore.setClassroom(1, {
            className: "Test",
            timer: { startTime: 1000, endTime: 6000, active: true, sound: false },
        });

        const before = Date.now();
        pauseTimer(1);
        const after = Date.now();

        const timer = classStateStore.getClassroom(1).timer;
        expect(timer.active).toBe(false);
        expect(timer.pausedAt).toBeGreaterThanOrEqual(before);
        expect(timer.pausedAt).toBeLessThanOrEqual(after);
        expect(timer.startTime).toBe(1000);
        expect(timer.endTime).toBe(6000);
    });

    it("does nothing when timer has non-finite startTime or endTime", () => {
        classStateStore.setClassroom(1, {
            className: "Test",
            timer: { startTime: undefined, endTime: undefined, active: true },
        });

        pauseTimer(1);

        const timer = classStateStore.getClassroom(1).timer;
        expect(timer.active).toBe(true);
        expect(timer.pausedAt).toBeUndefined();
    });
});

describe("resumeTimer()", () => {
    it("does nothing when the classroom does not exist", () => {
        expect(() => resumeTimer(999)).not.toThrow();
    });

    it("does nothing when the classroom has no timer", () => {
        classStateStore.setClassroom(1, { className: "Test" });
        resumeTimer(1);
        expect(classStateStore.getClassroom(1).timer).toBeUndefined();
    });

    it("does nothing when the timer is already active", () => {
        classStateStore.setClassroom(1, {
            className: "Test",
            timer: { startTime: 1000, endTime: 6000, active: true, pausedAt: 2000 },
        });

        resumeTimer(1);

        const timer = classStateStore.getClassroom(1).timer;
        expect(timer.active).toBe(true);
        expect(timer.startTime).toBe(1000);
    });

    it("shifts startTime and endTime by the paused duration", () => {
        const pausedAt = Date.now() - 500;
        classStateStore.setClassroom(1, {
            className: "Test",
            timer: { startTime: 1000, endTime: 6000, active: false, pausedAt },
        });

        const before = Date.now();
        resumeTimer(1);
        const after = Date.now();

        const timer = classStateStore.getClassroom(1).timer;
        expect(timer.active).toBe(true);
        expect(timer.pausedAt).toBeUndefined();

        const minDelta = before - pausedAt;
        const maxDelta = after - pausedAt;
        expect(timer.startTime).toBeGreaterThanOrEqual(1000 + minDelta);
        expect(timer.startTime).toBeLessThanOrEqual(1000 + maxDelta);
        expect(timer.endTime).toBeGreaterThanOrEqual(6000 + minDelta);
        expect(timer.endTime).toBeLessThanOrEqual(6000 + maxDelta);
    });

    it("does nothing when pausedAt is missing", () => {
        classStateStore.setClassroom(1, {
            className: "Test",
            timer: { startTime: 1000, endTime: 6000, active: false },
        });

        resumeTimer(1);

        const timer = classStateStore.getClassroom(1).timer;
        expect(timer.active).toBe(false);
        expect(timer.startTime).toBe(1000);
    });

    it("does nothing when startTime or endTime are not finite numbers", () => {
        classStateStore.setClassroom(1, {
            className: "Test",
            timer: { startTime: undefined, endTime: undefined, active: false, pausedAt: Date.now() },
        });

        resumeTimer(1);

        const timer = classStateStore.getClassroom(1).timer;
        expect(timer.active).toBe(false);
    });
});
