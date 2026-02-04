const { dbGetAll, dbGet, dbRun } = require("@modules/database");
const { database } = require("@modules/database");
const { logger } = require("@modules/logger");
const { setClassOfApiSockets, advancedEmitToClass, emitToUser, userSockets } = require("@modules/socket-updates");
const { classInformation, Classroom } = require("@modules/class/classroom");
const { MANAGER_PERMISSIONS, DEFAULT_CLASS_PERMISSIONS, CLASS_SOCKET_PERMISSIONS } = require("@modules/permissions");
const { getStudentsInClass, getIdFromEmail, getEmailFromId } = require("@modules/student");
const { generateKey } = require("@modules/util");
const { userSocketUpdates } = require("../sockets/init");
const { joinRoomByCode } = require("@services/room-service");
const { classKickStudent } = require("@modules/class/kick");
const { clearPoll } = require("@services/poll-service");
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
    // Parse JSON fields
    classroom.sharedPolls = JSON.parse(classroom.sharedPolls);
    classroom.pollHistory = JSON.parse(classroom.pollHistory);

    // Normalize tags to array
    if (classroom.tags) {
        classroom.tags = classroom.tags.split(",");
    } else {
        classroom.tags = [];
    }

    if (Array.isArray(classroom.pollHistory)) {
        // Parse poll data within poll history
        for (let poll of classroom.pollHistory) {
            poll.data = JSON.parse(poll.data);
        }

        // Handle empty poll history
        if (classroom.pollHistory[0] && classroom.pollHistory[0].id == null) {
            classroom.pollHistory = null;
        }
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

    logger.log("verbose", "[createClass] Added classroom to database");

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

    classroom.permissions = parseClassPermissions(permissions);
    await initializeClassroom({
        id: classroom.id,
        className: classroom.name,
        key: classroom.key,
        owner: ownerId,
        userEmail: ownerEmail,
        permissions: classroom.permissions,
        sharedPolls: [],
        pollHistory: [],
        tags: classroom.tags,
    });

    return {
        classId: classroom.id,
        key: classroom.key,
        className: classroom.name,
    };
}

/**
 * Joins an existing classroom by its ID
 * @async
 * @param {number} classId - The ID of the class to join
 * @param {number} userId - The ID of the user joining the class
 * @param {string} userEmail - The email of the user joining the class
 * @returns {Promise<{classId: number, key: string, className: string}>} Returns an object with class details on success
 * @throws {NotFoundError} Throws if the class does not exist
 */
async function joinClassById(classId, userId, userEmail) {
    const classroom = await dbGet(
        "SELECT classroom.id, classroom.name, classroom.key, classroom.owner, classroom.tags (CASE WHEN class_polls.pollId IS NULL THEN json_array() ELSE json_group_array(DISTINCT class_polls.pollId) END) as sharedPolls, (SELECT json_group_array(json_object('id', poll_history.id, 'class', poll_history.class, 'data', poll_history.data, 'date', poll_history.date)) FROM poll_history WHERE poll_history.class = classroom.id ORDER BY poll_history.date) as pollHistory FROM classroom LEFT JOIN class_polls ON class_polls.classId = classroom.id WHERE classroom.id = ?",
        [classId]
    );

    if (!classroom) {
        throw new NotFoundError("Class does not exist");
    }

    // Ensure class_permissions exists and normalize permissions to include defaults
    let permissionsRow = await dbGet("SELECT * FROM class_permissions WHERE classId = ?", [classroom.id]);

    classroom.permissions = parseClassPermissions(permissionsRow);

    // Normalize classroom data (JSON parsing, tags, poll history)
    normalizeClassroomData(classroom);

    // Initialize the classroom in memory
    await initializeClassroom({
        id: classroom.id,
        className: classroom.name,
        key: classroom.key,
        owner: classroom.owner,
        userEmail: userEmail,
        permissions: classroom.permissions,
        sharedPolls: classroom.sharedPolls,
        pollHistory: classroom.pollHistory,
        tags: classroom.tags,
    });

    return {
        classId: classroom.id,
        key: classroom.key,
        className: classroom.name,
    };
}

/**
 * Initializes a classroom in memory and adds the user to it
 * @private
 * @param {Object} params - The initialization parameters
 * @param {number} params.id - The class ID
 * @param {string} params.className - The class name
 * @param {string} params.key - The class key
 * @param {number} params.owner - The owner's user ID
 * @param {string} params.userEmail - The email of the user to add to the class
 * @param {Object} params.permissions - The class permissions object
 * @param {Array} [params.sharedPolls=[]] - Array of shared poll IDs
 * @param {Array} [params.pollHistory=[]] - Array of poll history objects
 * @param {Array|string} params.tags - Class tags
 * @returns {Promise<void>}
 */
async function initializeClassroom({ id, className, key, owner, userEmail, permissions, sharedPolls = [], pollHistory = [], tags }) {
    // Get the user's session data
    const user = classInformation.users[userEmail];
    if (!user) {
        throw new NotFoundError(`User ${userEmail} not found in classInformation`);
    }

    logger.log("verbose", `[initializeClassroom] id=(${id}) name=(${className}) key=(${key}) sharedPolls=(${JSON.stringify(sharedPolls)})`);

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
            await dbRun(`UPDATE class_permissions SET ? WHERE classId=?`, [permissions[permission], id]);
        }
    }

    // Create or update classroom in memory
    if (!classInformation.classrooms[id]) {
        classInformation.classrooms[id] = new Classroom(id, className, key, owner, permissions, sharedPolls, pollHistory, tags);
    } else {
        classInformation.classrooms[id].permissions = permissions;
        classInformation.classrooms[id].sharedPolls = sharedPolls;
        classInformation.classrooms[id].pollHistory = pollHistory;
        classInformation.classrooms[id].tags = tags;
    }

    // Add the user to the newly created/joined class
    classInformation.classrooms[id].students[userEmail] = user;
    classInformation.classrooms[id].students[userEmail].classPermissions = MANAGER_PERMISSIONS;
    classInformation.users[userEmail].activeClass = id;
    classInformation.users[userEmail].classPermissions = MANAGER_PERMISSIONS;

    // Get all students in the class and add them to the classroom
    const classStudents = await getStudentsInClass(id);
    for (const studentEmail in classStudents) {
        // If the student is the current user or already in the class, skip
        if (studentEmail === userEmail) continue;
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

        // Ensure 'Offline' is present exactly once at the front if the user
        // is not the creator of the class.
        if (studentEmail !== userEmail && !student.tags.includes("Offline")) {
            student.tags.unshift("Offline");
        }

        student.displayName = student.displayName || student.email;
        classInformation.users[studentEmail] = student;
        classInformation.classrooms[id].students[studentEmail] = student;
    }

    // Set the class for all API sockets
    await setClassOfApiSockets(user.API, id);

    logger.log("verbose", `[initializeClassroom] Successfully initialized class ${id} for user ${userEmail}`);
}

/**
 * Starts a class session by activating the class, emitting the start class event,
 * and updating the class state in memory and to connected clients.
 * @param {string|number} classId - The ID of the class to start.
 */
async function startClass(classId) {
    logger.log("info", `[startClass] classId=(${classId})`);
    await advancedEmitToClass("startClassSound", classId, { api: true });

    // Activate the class and send the class active event
    classInformation.classrooms[classId].isActive = true;
    advancedEmitToClass(
        "isClassActive",
        classId,
        { classPermissions: CLASS_SOCKET_PERMISSIONS.isClassActive },
        classInformation.classrooms[classId].isActive
    );

    logger.log("verbose", `[startClass] classInformation=(${JSON.stringify(classInformation)})`);
}

/**
 * Ends a class session by deactivating the class, emitting the end class event,
 * and updating the class state in memory and to connected clients.
 * @param {string|number} classId - The ID of the class to end.
 * @param {Object} [userSession] - The session object of the user ending the class.
 */
async function endClass(classId, userSession) {
    logger.log("info", `[endClass] classId=(${classId})`);
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
    logger.log("verbose", `[endClass] classInformation=(${JSON.stringify(classInformation)})`);
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
 * Allows a user to join a room using a class code.
 * Emits the joinClass event to the user with the result.
 * @param {Object} userSession - The session object of the user attempting to join.
 * @param {string} classCode - The code of the class to join.
 * @returns {Promise<boolean>} Returns true if joined successfully.
 */
async function joinRoom(userSession, classCode) {
    logger.log("info", `[joinRoom] session=(${JSON.stringify(userSession)}) classCode=${classCode}`);

    const response = await joinRoomByCode(classCode, userSession);
    emitToUser(userSession.email, "joinClass", response);
    return true;
}

/**
 * Removes a user from a class room.
 * Deletes the user from the class in memory and the database, updates the user's session,
 * emits leave events, and reloads the user's page.
 * @param {Object} userData - The session object of the user leaving the room.
 * @returns {Promise<void>}
 */
async function leaveRoom(userData) {
    const classId = userData.classId;
    const email = userData.email;
    const studentId = await getIdFromEmail(email);

    // Remove the user from the class
    delete classInformation.classrooms[classId].students[email];
    classInformation.users[email].activeClass = null;
    classInformation.users[email].break = false;
    classInformation.users[email].help = false;
    classInformation.users[email].classPermissions = null;
    await dbRun("DELETE FROM classusers WHERE classId=? AND studentId=?", [classId, studentId]);

    // If the owner of the classroom leaves, then delete the classroom
    const owner = (await dbGet("SELECT owner FROM classroom WHERE id=?", classId)).owner;
    if (owner == studentId) {
        await dbRun("DELETE FROM classroom WHERE id=?", classId);
    }

    // Update the class and play leave sound
    for (const socketUpdate of Object.values(userSocketUpdates[email])) {
        socketUpdate.classUpdate(classId);
    }

    // Play leave sound and reload the user's page
    await advancedEmitToClass("leaveSound", classId, {});
    await emitToUser(email, "reload");
}

/**
 * Allows a user to join a class by classId or class key.
 * @param {Object} userSession - The session object of the user attempting to join.
 * @param {string|number} classId - The ID or key of the class to join.
 * @returns {Promise<boolean>} Returns true if joined successfully.
 */
async function joinClass(userSession, classId) {
    logger.log("info", `[joinClass] session=(${JSON.stringify(userSession)}) classId=${classId}`);

    const email = userSession.email;
    const studentId = await getIdFromEmail(email);

    // Convert class key to ID if necessary
    const dbClassroom = await dbGet("SELECT * FROM classroom WHERE key=? OR id=?", [classId, classId]);
    if (!dbClassroom) {
        throw new NotFoundError("Class not found");
    }

    classId = dbClassroom.id;

    // Check if the user is in the class to prevent people from joining classes just from the class ID
    if (!classInformation.classrooms[classId]) {
        const classUsers = await dbGet("SELECT * FROM classusers WHERE studentId=? AND classId=?", [studentId, classId]);
        if (!classUsers && dbClassroom.owner !== studentId) {
            throw new ForbiddenError("You are not in that class");
        }
    } else if (!classInformation.classrooms[classId].students[email]) {
        throw new ForbiddenError("You are not in that class");
    }

    // Join the class using the class code
    const response = await joinRoomByCode(dbClassroom.key, userSession);

    // Update all user sockets with the new class
    if (response === true && userSockets[email]) {
        for (const userSocket of Object.values(userSockets[email])) {
            userSocket.request.session.classId = classId;
            userSocket.request.session.save();
            userSocket.emit("joinClass", response);
        }
    }

    return true;
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
        return false;
    }

    // Kick the user from the classroom entirely if they're a guest
    // If not, kick them from the session
    advancedEmitToClass("leaveSound", userData.classId, {});
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
    createClass,
    joinClassById,
    normalizeClassroomData,
    startClass,
    endClass,
    checkUserClassPermission,
    joinRoom,
    leaveRoom,
    joinClass,
    leaveClass,
    isClassActive,
    deleteRooms,
};
