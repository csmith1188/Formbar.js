const { dbGetAll, dbGet, dbRun } = require("@modules/database");

const {
    advancedEmitToClass,
    userSockets,
    setClassOfApiSockets,
    setClassOfUserSockets,
    userUpdateSocket,
    invalidateClassPollCache,
} = require("@modules/socket-updates");
const { classInformation, Classroom } = require("@modules/class/classroom");
const {
    MANAGER_PERMISSIONS,
    DEFAULT_CLASS_PERMISSIONS,
    CLASS_SOCKET_PERMISSIONS,
    BANNED_PERMISSIONS,
    TEACHER_PERMISSIONS,
} = require("@modules/permissions");
const { getStudentsInClass, getIdFromEmail, getEmailFromId } = require("@modules/student");
const { generateKey } = require("@modules/util");
const { classKickStudent } = require("@modules/class/kick");
const { clearPoll } = require("@services/poll-service");
const { requireInternalParam } = require("@modules/error-wrapper");
const ValidationError = require("@errors/validation-error");
const NotFoundError = require("@errors/not-found-error");
const ForbiddenError = require("@errors/forbidden-error");
const AppError = require("@errors/app-error");

async function isUserInClass(userId, classId) {
    const result = await dbGet("SELECT 1 FROM classusers WHERE studentId = ? AND classId = ?", [userId, classId]);
    return !!result;
}

function getUserJoinedClasses(userId) {
    return dbGetAll(
        "SELECT classroom.name, classroom.id, classusers.permissions FROM classroom JOIN classusers ON classroom.id = classusers.classId WHERE classusers.studentId = ?",
        [userId]
    );
}

function getClassLinks(classId) {
    return dbGetAll("SELECT name, url FROM links WHERE classId = ?", [classId]);
}

async function getClassCode(classId) {
    const result = await dbGet("SELECT key FROM classroom WHERE id = ?", [classId]);
    return result ? result.key : null;
}

async function getClassIdByCode(classCode) {
    const result = await dbGet("SELECT id FROM classroom WHERE key = ?", [classCode]);
    return result ? result.id : null;
}

/**
 * Validates a classroom name
 * @param {string} className - The classroom name to validate
 * @returns {{valid: boolean, error?: string}} Returns validation result with error message if invalid
 */
function validateClassroomName(className) {
    if (!className || typeof className !== "string") {
        return { valid: false, error: "Classroom name is required" };
    }

    const trimmedName = className.trim();

    // Regex validates: 3-30 chars, no consecutive spaces, allowed chars only
    const validPattern = /^(?!.*\s{2})[a-zA-Z0-9\s\-_.'()&,]{3,30}$/;

    if (!validPattern.test(trimmedName)) {
        if (trimmedName.length === 0) {
            return { valid: false, error: "Classroom name cannot be empty" };
        }
        if (trimmedName.length < 3) {
            return { valid: false, error: "Classroom name must be at least 3 characters long" };
        }
        if (trimmedName.length > 100) {
            return { valid: false, error: "Classroom name must be 100 characters or less" };
        }
        return {
            valid: false,
            error: "Classroom name contains invalid characters. Only letters, numbers, spaces, and common punctuation (- _ . ' ( ) & ,) are allowed",
        };
    }

    return { valid: true };
}

/**
 * Parses and normalizes class permissions from database row
 * @private
 * @param {Object} permissionsRow - The permissions row from the database
 * @returns {Object} Normalized permissions object with defaults applied
 */
function parseClassPermissions(permissionsRow) {
    const parsedPermissions = {};
    for (let permission of Object.keys(DEFAULT_CLASS_PERMISSIONS)) {
        parsedPermissions[permission] =
            permissionsRow && permissionsRow[permission] != null ? permissionsRow[permission] : DEFAULT_CLASS_PERMISSIONS[permission];
    }
    return parsedPermissions;
}

/**
 * Normalizes classroom data fetched from database
 * Parses JSON fields and normalizes tags and poll history
 * @param {Object} classroom - The classroom object from database
 * @returns {Object} The normalized classroom object (mutates in place)
 */
function normalizeClassroomData(classroom) {
    // Normalize tags to array
    if (classroom.tags) {
        classroom.tags = classroom.tags.split(",");
    } else {
        classroom.tags = [];
    }

    return classroom;
}

/**
 * Creates a new classroom with the given name and owner
 * @async
 * @param {string} className - The name of the class to create
 * @param {number} ownerId - The ID of the user creating the class
 * @param {string} ownerEmail - The email of the user creating the class
 * @returns {Promise<{classId: number, key: string, className: string}>} Returns an object with class details on success
 * @throws {ValidationError} Throws if the classroom name is invalid
 * @throws {Error} Throws if class creation fails
 */
async function createClass(className, ownerId, ownerEmail) {
    // Validate classroom name
    const validation = validateClassroomName(className);
    if (!validation.valid) {
        throw new ValidationError(validation.error);
    }

    const key = generateKey(4);

    // Add classroom to the database
    const insertResult = await dbRun("INSERT INTO classroom(name, owner, key, tags) VALUES(?, ?, ?, ?)", [className, ownerId, key, null]);

    // Use the ID of the newly created classroom returned by dbRun
    const classId = insertResult;
    if (!classId) {
        throw new AppError("Class was not created successfully");
    }

    const classroom = {
        id: classId,
        name: className,
        key: key,
        tags: null,
    };

    // Ensure class_permissions exists for the new class
    let permissions = await dbGet("SELECT * FROM class_permissions WHERE classId = ?", [classroom.id]);
    if (!permissions) {
        permissions = { ...DEFAULT_CLASS_PERMISSIONS };
        await dbRun("INSERT OR IGNORE INTO class_permissions (classId) VALUES (?)", [classroom.id]);
    }

    // Initialize the classroom in memory
    await initializeClassroom(classroom.id);

    return {
        classId: classroom.id,
        key: classroom.key,
        className: classroom.name,
    };
}

/**
 * Initializes a classroom in memory
 * Fetches all necessary data from the database and creates/updates the classroom in memory
 * @private
 * @param {number} id - The class ID to initialize
 * @returns {Promise<void>}
 */
async function initializeClassroom(id) {
    // Fetch classroom data from database
    const classroom = await dbGet("SELECT id, name, key, owner, tags FROM classroom WHERE id = ?", [id]);

    if (!classroom) {
        throw new NotFoundError(`Class with id ${id} does not exist`);
    }

    // Fetch and normalize permissions
    let permissionsRow = await dbGet("SELECT * FROM class_permissions WHERE classId = ?", [id]);
    if (!permissionsRow) {
        await dbRun("INSERT OR IGNORE INTO class_permissions (classId) VALUES (?)", [id]);
        permissionsRow = await dbGet("SELECT * FROM class_permissions WHERE classId = ?", [id]);
    }

    const permissions = parseClassPermissions(permissionsRow);

    // Normalize classroom data (JSON parsing, tags, poll history)
    normalizeClassroomData(classroom);

    // Validate and normalize permissions
    if (Object.keys(permissions).sort().toString() !== Object.keys(DEFAULT_CLASS_PERMISSIONS).sort().toString()) {
        for (let permission of Object.keys(permissions)) {
            if (!DEFAULT_CLASS_PERMISSIONS[permission]) {
                delete permissions[permission];
            }
        }

        for (let permission of Object.keys(permissions)) {
            if (typeof permissions[permission] != "number" || permissions[permission] < 1 || permissions[permission] > 5) {
                permissions[permission] = DEFAULT_CLASS_PERMISSIONS[permission];
            }
            await dbRun(`UPDATE class_permissions SET ${permission} = ? WHERE classId=?`, [permissions[permission], id]);
        }
    }

    // Create or update classroom in memory
    if (!classInformation.classrooms[id]) {
        classInformation.classrooms[id] = new Classroom({
            id,
            className: classroom.name,
            key: classroom.key,
            owner: classroom.owner,
            permissions,
            tags: classroom.tags,
        });
    } else {
        classInformation.classrooms[id].permissions = permissions;
        classInformation.classrooms[id].tags = classroom.tags;
    }

    // Get all students in the class and add them to the classroom
    const classStudents = await getStudentsInClass(id);
    for (const studentEmail in classStudents) {
        // If the student is already in the class, skip
        if (classInformation.classrooms[id].students[studentEmail]) continue;

        const student = classStudents[studentEmail];

        // Normalize student.tags to an array of strings
        if (!Array.isArray(student.tags)) {
            if (typeof student.tags === "string" && student.tags.trim() !== "") {
                student.tags = student.tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean);
            } else {
                student.tags = [];
            }
        }

        // Ensure 'Offline' is present exactly once at the front
        if (!student.tags.includes("Offline")) {
            student.tags.unshift("Offline");
        }

        student.displayName = student.displayName || student.email;
        classInformation.users[studentEmail] = student;
        classInformation.classrooms[id].students[studentEmail] = student;
    }
}

/**
 * Starts a class session by activating the class, emitting the start class event,
 * and updating the class state in memory and to connected clients.
 * @param {string|number} classId - The ID of the class to start.
 */
async function startClass(classId) {
    await advancedEmitToClass("startClassSound", classId, { api: true });

    // Activate the class and send the class active event
    classInformation.classrooms[classId].isActive = true;
    advancedEmitToClass(
        "isClassActive",
        classId,
        { classPermissions: CLASS_SOCKET_PERMISSIONS.isClassActive },
        classInformation.classrooms[classId].isActive
    );
}

/**
 * Ends a class session by deactivating the class, emitting the end class event,
 * and updating the class state in memory and to connected clients.
 * @param {string|number} classId - The ID of the class to end.
 * @param {Object} [userSession] - The session object of the user ending the class.
 */
async function endClass(classId, userSession) {
    await advancedEmitToClass("endClassSound", classId, { api: true });

    // Deactivate the class and send the class active event
    classInformation.classrooms[classId].isActive = false;
    await clearPoll(classId, userSession, true);

    advancedEmitToClass(
        "isClassActive",
        classId,
        { classPermissions: CLASS_SOCKET_PERMISSIONS.isClassActive },
        classInformation.classrooms[classId].isActive
    );
}

/**
 * Checks if the user has the required permission level for a class action.
 * @param {string|number} userId - The user's ID to check permissions for.
 * @param {string|number} classId - The class ID to check against.
 * @param {string} permission - The class permission to check (e.g., CLASS_PERMISSIONS.MANAGE_CLASS).
 * @returns {Promise<boolean>} Resolves to true if the user has permission, false otherwise.
 */
async function checkUserClassPermission(userId, classId, permission) {
    const email = await getEmailFromId(userId);
    const user = classInformation.users[email];
    const classroom = classInformation.classrooms[classId];

    if (!user || !classroom) {
        throw new NotFoundError("User or classroom not found in active sessions");
    }

    return user.classPermissions >= classroom.permissions[permission];
}

/**
 * Internal function to add a user to a classroom session in memory.
 * Does not perform authorization checks - caller must validate permissions.
 * @private
 * @param {number} classId - The class ID
 * @param {string} email - User's email
 * @param {Object} sessionUser - The user's session object
 * @returns {Promise<boolean>} Returns true if successful
 */
async function addUserToClassroomSession(classId, email, sessionUser) {
    // Find the user
    let user = await dbGet("SELECT id FROM users WHERE email=?", [email]);

    if (!user && !classInformation.users[email]) {
        throw new NotFoundError("User is not in database");
    } else if (classInformation.users[email] && classInformation.users[email].isGuest) {
        user = classInformation.users[email];
    }

    // Get the class-user relationship if the user is not a guest
    let classUser;
    if (!user.isGuest) {
        classUser = await dbGet("SELECT * FROM classusers WHERE classId=? AND studentId=?", [classId, user.id]);
    }

    // Get the classroom from database to check ownership
    const classroomDb = await dbGet("SELECT owner FROM classroom WHERE id=?", [classId]);
    if (!classroomDb) {
        throw new NotFoundError("Class not found");
    }

    // If the user is the owner of the classroom, give them manager permissions
    if (classroomDb.owner === user.id) {
        if (!classUser) {
            classUser = { permissions: MANAGER_PERMISSIONS, tags: "" };
        } else {
            classUser.permissions = MANAGER_PERMISSIONS;
        }
    }

    if (classUser) {
        // If the user is banned, don't let them join
        if (classUser.permissions <= BANNED_PERMISSIONS) {
            throw new ForbiddenError("You are banned from that class");
        }

        // Get the student's session data
        let currentUser = classInformation.users[email];

        // Set class permissions and active class
        currentUser.classPermissions = classUser.permissions;
        currentUser.activeClass = classId;

        // Load tags from classusers table
        currentUser.tags = classUser.tags ? classUser.tags.split(",").filter(Boolean) : [];
        currentUser.tags = currentUser.tags.filter((tag) => tag !== "Offline");
        classInformation.users[email].tags = currentUser.tags;

        // Add the student to the class
        const classroom = classInformation.classrooms[classId];
        classroom.students[email] = currentUser;

        // Set the active class of the user
        classInformation.users[email].activeClass = classId;
        advancedEmitToClass("joinSound", classId, {});

        // Set session class and classId
        sessionUser.classId = classId;

        // Set the class of the API socket
        setClassOfApiSockets(currentUser.API, classId);

        // Move all user sockets (session-based and JWT-based) to the new class room
        // This ensures sockets receive classUpdate emissions when joining via HTTP
        setClassOfUserSockets(email, classId);

        // Call classUpdate on all user's tabs
        userUpdateSocket(email, "classUpdate", classId, { global: false, restrictToControlPanel: true });
        return true;
    } else {
        // If the user is not a guest, insert them into the database
        if (!user.isGuest) {
            await dbRun("INSERT INTO classusers(classId, studentId, permissions) VALUES(?, ?, ?)", [
                classId,
                user.id,
                classInformation.classrooms[classId].permissions.userDefaults,
            ]);
        }

        // Grab the user from the users list
        const classData = classInformation.classrooms[classId];
        let currentUser = classInformation.users[email];
        currentUser.classPermissions = currentUser.id !== classData.owner ? classData.permissions.userDefaults : TEACHER_PERMISSIONS;
        currentUser.activeClass = classId;
        currentUser.tags = [];

        // Add the student to the class
        classData.students[email] = currentUser;

        classInformation.users[email].activeClass = classId;

        setClassOfApiSockets(currentUser.API, classId);

        // Move all user sockets (session-based and JWT-based) to the new class room
        // This ensures sockets receive classUpdate emissions when joining via HTTP
        setClassOfUserSockets(email, classId);

        // Call classUpdate on all user's tabs
        userUpdateSocket(email, "classUpdate", classId, { global: false, restrictToControlPanel: true });
        return true;
    }
}

/**
 * Allows a user to join a class by classId or class key.
 * @param {Object} userData - The session object of the user attempting to join.
 * @param {string|number} classId - The ID or key of the class to join.
 * @returns {Promise<boolean>} Returns true if joined successfully.
 */
async function joinClass(userData, classId) {
    const email = userData.email;
    requireInternalParam(classId, "classId");
    requireInternalParam(email, "email");

    // Convert class key to ID if necessary
    const dbClassroom = await dbGet("SELECT * FROM classroom WHERE key=? OR id=?", [classId, classId]);
    if (!dbClassroom) {
        throw new NotFoundError("Class not found");
    }

    // Use the class ID from the database
    classId = dbClassroom.id;

    if (userData.activeClass === classId) {
        throw new ValidationError("You are already in that class");
    }

    // Check if the user is in the class to prevent people from joining classes just from the class ID
    const studentId = await getIdFromEmail(email);
    const classUsers = await dbGet("SELECT * FROM classusers WHERE studentId=? AND classId=?", [studentId, classId]);
    const classroomOwner = await dbGet("SELECT owner FROM classroom WHERE id=?", [classId]);

    // User must either be in classusers table or be the owner of the classroom
    if (!classUsers && (!classroomOwner || classroomOwner.owner !== studentId)) {
        throw new ForbiddenError("You are not in that class");
    }

    // Initialize classroom if not already loaded
    if (!classInformation.classrooms[classId]) {
        await initializeClassroom(classId);
    }

    // Add user to classroom session
    const response = await addUserToClassroomSession(classId, email, userData);

    // Update all user sockets with the new class
    if (response === true && userSockets[email]) {
        for (const userSocket of Object.values(userSockets[email])) {
            userSocket.request.session.classId = classId;
            userSocket.request.session.save();
            userSocket.emit("joinClass", response);
        }
    }
}

/**
 * Removes a user from a class session.
 * Kicks the user from the classroom if they are a guest, or from the session otherwise.
 * Emits leave sound and updates the class state.
 * @param {Object} userData - The session object of the user leaving the class.
 * @param {number} [classId] - The ID of the class to leave. If not provided, uses the user's active class.
 * @returns {boolean} True if the user was removed successfully, false otherwise.
 */
function leaveClass(userData, classId) {
    // If no classId is provided, use the user's active class
    if (!classId) {
        classId = userData.activeClass;
    }

    const email = userData.email;
    const user = classInformation.users[email];
    if (!user || user.activeClass !== classId) {
        throw new NotFoundError("User is not in the specified class");
    }

    // Kick the user from the classroom entirely if they're a guest
    // If not, kick them from the session
    advancedEmitToClass("leaveSound", classId, {});
    classKickStudent(user.id, classId, { exitRoom: classInformation.users[email].isGuest });
    return true;
}

/**
 * Checks if the class with the given classId is currently active.
 * @param {number} classId - The ID of the class to check.
 * @returns {boolean} True if the class is active, false otherwise.
 */
function isClassActive(classId) {
    const classroom = classInformation.classrooms[classId];
    return classroom.isActive;
}

/**
 * Deletes all classrooms owned by the specified user, along with related data in other tables.
 * @param {number|string} userId - The ID of the user whose classrooms should be deleted.
 */
async function deleteRooms(userId) {
    const classrooms = await dbGetAll("SELECT * FROM classroom WHERE owner=?", userId);
    if (classrooms.length == 0) return;

    await dbRun("DELETE FROM classroom WHERE owner=?", classrooms[0].owner);
    for (const classroom of classrooms) {
        if (classInformation.classrooms[classroom.id]) {
            await endClass(classroom.id);
        }

        await Promise.all([
            dbRun("DELETE FROM classusers WHERE classId=?", classroom.id),
            dbRun("DELETE FROM class_polls WHERE classId=?", classroom.id),
            dbRun("DELETE FROM links WHERE classId=?", classroom.id),
            dbRun("DELETE FROM lessons WHERE class=?", classroom.id),
        ]);
        invalidateClassPollCache(classroom.id);
    }
}

module.exports = {
    isUserInClass,
    getUserJoinedClasses,
    getClassCode,
    getClassLinks,
    getClassIdByCode,
    validateClassroomName,
    initializeClassroom,
    addUserToClassroomSession,
    createClass,
    startClass,
    endClass,
    checkUserClassPermission,
    joinClass,
    leaveClass,
    isClassActive,
    deleteRooms,
};
