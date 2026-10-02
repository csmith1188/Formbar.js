/**
 * @module class-membership-service
 *
 * Manages persistent classroom membership — enrollment, unenrollment, and
 * classroom-level data (links, bans). Operations here survive across sessions
 * and are backed by the database.
 *
 * For active session management (start/end, timers, polls, breaks, help),
 * see `class-service`. For the shared Classroom model and state store,
 * see `classroom-service`.
 */
const { classStateStore, getClassIDFromCode } = require("@services/classroom-service");
const { classCodeCacheStore } = require("@stores/class-code-cache-store");
const { dbGet, dbRun, dbGetAll } = require("@modules/database");
const { advancedEmitToClass, emitToUser, invalidateClassPollCache } = require("@services/socket-updates-service");
const { getIdFromEmail, getEmailFromId } = require("@services/student-service");
const { SCOPES, BANNED_PERMISSIONS } = require("@modules/permissions");
const { buildRoleReferences } = require("@modules/role-reference");
const { userSocketUpdates } = require("../sockets/init");
const { requireInternalParam } = require("@modules/error-wrapper");
const NotFoundError = require("@errors/not-found-error");
const { joinClass } = require("@services/class-service");

// Lazy-load class-service to avoid circular dependency
let classService;
/**
 * Load class-service after startup to avoid a circular dependency.
 * @returns {Object}
 */
function getClassService() {
    if (!classService) {
        classService = require("@services/class-service");
    }
    return classService;
}

/**
 * Delete a classroom and its related persistent data.
 * @param {number} classroomId - classroomId.
 * @returns {Promise<void>}
 */
async function deleteClassroom(classroomId) {
    requireInternalParam(classroomId, "classroomId");

    // End the active class session if it's currently loaded in memory
    if (classStateStore.getClassroom(classroomId)) {
        await getClassService().endClass(classroomId);
    }

    await dbRun("BEGIN TRANSACTION");
    try {
        const pollRows = await dbGetAll("SELECT id FROM poll_history WHERE class=?", [classroomId]);
        const pollIds = pollRows.map((row) => row.id);
        const studentRows = await dbGetAll("SELECT studentId FROM classusers WHERE classId=?", [classroomId]);
        const studentIds = studentRows.map((row) => row.studentId);

        await dbRun("DELETE FROM classroom WHERE id=?", [classroomId]);
        await dbRun("DELETE FROM class_polls WHERE classId=?", [classroomId]);
        await dbRun("DELETE FROM links WHERE classId=?", [classroomId]);
        await dbRun("DELETE FROM user_roles WHERE classId=?", [classroomId]);
        await dbRun("DELETE FROM class_roles WHERE classId=?", [classroomId]);

        if (pollIds.length) {
            const pollPlaceholders = pollIds.map(() => "?").join(", ");
            await dbRun(`DELETE FROM poll_answers WHERE pollId IN (${pollPlaceholders})`, pollIds);
            await dbRun(`DELETE FROM shared_polls WHERE pollId IN (${pollPlaceholders})`, pollIds);
        }

        await dbRun("DELETE FROM poll_history WHERE class=?", [classroomId]);

        if (studentIds.length) {
            const studentPlaceholders = studentIds.map(() => "?").join(", ");
            await dbRun(`DELETE FROM custom_polls WHERE owner IN (${studentPlaceholders})`, studentIds);
        }

        await dbRun("DELETE FROM classusers WHERE classId=?", [classroomId]);

        await dbRun(
            `DELETE FROM roles
             WHERE isDefault = 0
               AND id NOT IN (SELECT roleId FROM class_roles)`
        );
        await dbRun("COMMIT");
    } catch (err) {
        try {
            await dbRun("ROLLBACK");
        } catch (rollbackErr) {
            // Intentionally ignore rollback errors to avoid masking the original error
        }
        throw err;
    }

    // Invalidate in-memory caches
    invalidateClassPollCache(classroomId);
    classCodeCacheStore.invalidateByClassId(classroomId);
}

/**
 * Fetch a classroom row by ID.
 * @param {number} classroomId - classroomId.
 * @returns {Promise<Object|null>}
 */
function getClassroomById(classroomId) {
    requireInternalParam(classroomId, "classroomId");

    return dbGet("SELECT * FROM classroom WHERE id=?", [classroomId]);
}

/**
 * Apply or remove a classroom ban for a user.
 * @param {number} classroomId - classroomId.
 * @param {number} userId - userId.
 * @param {boolean} isBanned - isBanned.
 * @returns {Promise<boolean>}
 * @throws {NotFoundError} When the user does not exist.
 */
async function setClassroomBanStatus(classroomId, userId, isBanned) {
    requireInternalParam(classroomId, "classroomId");
    requireInternalParam(userId, "userId");

    const email = await getEmailFromId(userId);

    if (!email) {
        throw new NotFoundError("User not found");
    }

    let bannedRole = null;
    if (isBanned) {
        const { findRoleByPermissionLevel } = require("@services/role-service");
        bannedRole = await findRoleByPermissionLevel(BANNED_PERMISSIONS, classroomId);
        if (bannedRole) {
            await dbRun("DELETE FROM user_roles WHERE userId = ? AND classId = ?", [userId, classroomId]);
            await dbRun("INSERT INTO user_roles (userId, roleId, classId) VALUES (?, ?, ?)", [userId, bannedRole.id, classroomId]);
        }
    } else {
        await dbRun("DELETE FROM user_roles WHERE userId = ? AND classId = ?", [userId, classroomId]);
    }

    const activeStudent = classStateStore.getClassroomStudent(classroomId, email);
    if (activeStudent) {
        const classroom = classStateStore.getClassroom(classroomId);
        const normalizedBannedRole =
            isBanned && bannedRole
                ? classroom?.availableRoles?.find(
                    (role) =>
                        Number(role.id) === Number(bannedRole.id) ||
                        (Array.isArray(role.scopes) && role.scopes.includes(SCOPES.CLASS.SYSTEM.BLOCKED))
                ) || bannedRole
                : null;

        classStateStore.updateClassroomStudent(classroomId, email, {
            roles: {
                global: activeStudent?.roles?.global || [],
                class: normalizedBannedRole ? buildRoleReferences([normalizedBannedRole]) : [],
            },
        });
    }

    await getClassService().classKickStudent(userId, classroomId, { exitRoom: true, ban: isBanned });
    return true;
}

/**
 * Enroll a user in a classroom for the first time using a class code.
 *
 * Use this function when a user is joining with a code they received. For rejoining a class
 * the user is already a member of, use `joinClass` from `class-service` instead.
 *
 * This function will:
 * *  - Look up the classroom by the provided code.
 * *  - Initialize the classroom in memory if it's not already loaded.
 * *  - Delegate the actual joining logic to `class-service.addUserToClassroomSession`.
 *
 * @param {string} code - The class code to enroll with.
 * @param {Object} sessionUser - The user's session object (must include `email`).
 * @returns {Promise<{success: boolean, roomId?: number}>} Resolves to an object with `success: true` and `roomId` on success, or `{ success: false }` if the underlying service indicates the enrollment failed.
 * @throws {NotFoundError} If no class exists with that code.
 * @throws {Error} Errors from `class-service` (for example, permission/ban related errors) are propagated.
 */
async function enrollByCode(code, sessionUser) {
    const email = sessionUser.email;

    // Resolve class code to classroom ID (uses cache when available)
    const classId = await getClassIDFromCode(code);

    if (!classId) {
        throw new NotFoundError("No class with that code");
    }

    // Initialize classroom if not already loaded
    if (!classStateStore.getClassroom(classId)) {
        await getClassService().initializeClassroom(classId);
    }

    // Delegate to class-service to handle the actual joining logic
    const result = await getClassService().addUserToClassroomSession(classId, email, sessionUser);
    if (!result) {
        return { success: false };
    }

    joinClass(sessionUser, classId)

    return {
        success: true,
        roomId: classId,
    };
}

/**
 * Enroll in a class by code and emit the result back to the user's sockets.
 *
 * This wraps `enrollByCode` and forwards the resulting payload to the user's
 * connected clients via the `joinClass` socket event. The event is intentionally
 * named `joinClass` (not `enroll`) because the client treats both first-time
 * enrollment and session re-joins identically once the server responds.
 *
 * @param {Object} userSession - The session object of the user attempting to enroll. Must include `email`.
 * @param {string} classCode - The code of the class to enroll in.
 * @returns {Promise<{success: boolean, roomId?: number}>} Resolves to the enrollment result. On success `success` is true and `roomId` is provided.
 * @throws {NotFoundError} If no class exists with that code (propagated from `enrollByCode`).
 * @throws {Error} Errors from `class-service` (for example, permission/ban related errors) are propagated.
 */
async function enrollInClass(userSession, classCode) {
    const response = await enrollByCode(classCode, userSession);
    emitToUser(userSession.email, "joinClass", response);
    return response;
}

/**
 * Permanently removes a user from a classroom.
 * Deletes the user from the class in memory and the database, updates the user's session,
 * emits leave events, and reloads the user's page.
 * @param {Object} userData - The session object of the user being unenrolled.
 * @param {number} classId - The ID of the class from which to unenroll the user.
 * @returns {Promise<void>}
 */
async function unenrollFromClass(userData, classId) {
    const email = userData.email;
    const resolvedClassId = classId ?? userData.classId ?? userData.activeClass;
    const studentId = await getIdFromEmail(email);

    // Remove the user from the class
    classStateStore.removeClassroomStudent(resolvedClassId, email);
    classStateStore.updateUser(email, {
        activeClass: null,
        break: false,
        help: false,
    });
    await dbRun("DELETE FROM classusers WHERE classId=? AND studentId=?", [resolvedClassId, studentId]);

    // If the owner of the classroom leaves, then delete the classroom
    const classRow = await dbGet("SELECT owner FROM classroom WHERE id=?", resolvedClassId);
    if (classRow && classRow.owner === studentId) {
        await deleteClassroom(resolvedClassId);
    }

    // Update the class and play leave sound
    const userSockets = userSocketUpdates.get(email);
    if (userSockets) {
        for (const socketUpdate of userSockets.values()) {
            socketUpdate.classUpdate(resolvedClassId);
        }
    }

    // Play leave sound and reload the user's page
    await advancedEmitToClass("leaveSound", resolvedClassId, {});
    await emitToUser(email, "reload");
}

/**
 * Check whether a user is enrolled in a class.
 * @param {number} userId - userId.
 * @param {number} classId - classId.
 * @returns {Promise<boolean>}
 */
async function isUserEnrolled(userId, classId) {
    const result = await dbGet("SELECT 1 FROM classusers WHERE studentId = ? AND classId = ?", [userId, classId]);
    return !!result;
}

/**
 * Get saved links for a class.
 * @param {number} classId - classId.
 * @returns {Promise<Object[]>}
 */
function getClassLinks(classId) {
    requireInternalParam(classId, "classId");
    return dbGetAll("SELECT name, url FROM links WHERE classId = ?", [classId]);
}

/**
 * Get saved links for a class with pagination.
 * @param {number} classId - classId.
 * @param {number} limit - limit.
 * @param {number} offset - offset.
 * @returns {Promise<Object>}
 */
async function getClassLinksPaginated(classId, limit = 20, offset = 0) {
    requireInternalParam(classId, "classId");

    const totalRow = await dbGet("SELECT COUNT(*) AS count FROM links WHERE classId = ?", [classId]);
    const links = await dbGetAll("SELECT name, url FROM links WHERE classId = ? ORDER BY id ASC LIMIT ? OFFSET ?", [classId, limit, offset]);

    return {
        links,
        total: totalRow ? totalRow.count : 0,
    };
}

/**
 * Middleware-compatible ownership check for classrooms.
 * Returns a promise resolving to boolean, suitable for isOwnerOrHasScopes middleware.
 * Also caches the classroom on req._room for use by the handler.
 * @param {import("express").Request} req - Request object.
 * @returns {Promise<boolean>}
 */
async function classroomOwnerCheck(req) {
    const classroom = await getClassroomById(Number(req.params.id));
    if (!classroom) {
        throw new NotFoundError("Classroom not found");
    }
    req._room = classroom;
    return classroom.owner === req.user.id;
}

module.exports = {
    deleteClassroom,
    getClassroomById,
    setClassroomBanStatus,
    classroomOwnerCheck,
    enrollByCode,
    enrollInClass,
    unenrollFromClass,
    isUserEnrolled,
    getClassLinks,
    getClassLinksPaginated,
};
