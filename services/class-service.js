const { dbGetAll, dbGet, dbRun, database } = require("@modules/database");
const {
    advancedEmitToClass,
    emitToUser,
    setClassOfApiSockets,
    setClassOfUserSockets,
    userUpdateSocket,
    invalidateClassPollCache,
} = require("@services/socket-updates-service");
const { Classroom, classStateStore, getClassIDFromCode } = require("@services/classroom-service");
const { classCodeCacheStore } = require("@stores/class-code-cache-store");
const { socketStateStore } = require("@stores/socket-state-store");
const { SCOPES, CLASS_MOD_SCOPES, CLASS_TEACHER_SCOPES } = require("@modules/permissions");
const { getAssignedClassScopes, getClassAccessProfile, userHasAnyScope, userHasScope } = require("@modules/scope-resolver");
const { getStudentsInClass, getIdFromEmail, getEmailFromId } = require("@services/student-service");
const { generateKey } = require("@modules/util");
const { clearPoll } = require("@services/poll-service");
const { loadCustomRoles, getClassRoles, getStudentRoleAssignments, addDefaultClassRoles, getStudentRoles, removeStudentRole, getUserRoles } = require("@services/role-service");
const { requireInternalParam } = require("@modules/error-wrapper");
const { buildRoleReferences } = require("@modules/role-reference");
const { io } = require("@modules/web-server");
const ValidationError = require("@errors/validation-error");
const NotFoundError = require("@errors/not-found-error");
const ForbiddenError = require("@errors/forbidden-error");
const AppError = require("@errors/app-error");

/**
 * Get classes joined by a user.
 * @param {number} userId - userId.
 * @returns {Promise<Object[]>}
 */
function getUserJoinedClasses(userId) {
    return dbGetAll(
        "SELECT classroom.name, classroom.id FROM classroom JOIN classusers ON classroom.id = classusers.classId WHERE classusers.studentId = ?",
        [userId]
    );
}

/**
 * Get the join code for a class.
 * @param {number} classId - classId.
 * @returns {Promise<string|null>}
 */
async function getClassCode(classId) {
    const result = await dbGet("SELECT key FROM classroom WHERE id = ?", [classId]);
    return result ? result.key : null;
}

/**
 * Find the first available class role containing a scope.
 * @param {Object} classroom - classroom.
 * @param {string} scope - scope.
 * @returns {Object|null}
 */
function findAvailableRoleByScope(classroom, scope) {
    if (!classroom || !Array.isArray(classroom.availableRoles)) {
        return null;
    }

    return classroom.availableRoles.find((role) => Array.isArray(role.scopes) && role.scopes.includes(scope)) || null;
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
    const insertResult = await dbRun("INSERT INTO classroom(name, owner, key) VALUES(?, ?, ?)", [className, ownerId, key]);

    // Use the ID of the newly created classroom returned by dbRun
    const classId = insertResult;
    if (!classId) {
        throw new AppError("Class was not created successfully", { event: "class.create.failed", reason: "db_insert_failed", className, ownerId });
    }

    await addDefaultClassRoles(classId);

    const classroom = {
        id: classId,
        name: className,
        key: key,
    };

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
    const classroom = await dbGet("SELECT id, name, key, owner FROM classroom WHERE id = ?", [id]);

    if (!classroom) {
        throw new NotFoundError(`Class with id ${id} does not exist`);
    }

    // Create or update classroom in memory
    const customRoles = await loadCustomRoles(id);
    const availableRoles = await getClassRoles(id);
    if (!classStateStore.getClassroom(id)) {
        classStateStore.setClassroom(
            id,
            new Classroom({
                id,
                className: classroom.name,
                key: classroom.key,
                owner: classroom.owner,
                customRoles,
                availableRoles,
            })
        );
    } else {
        classStateStore.getClassroom(id).customRoles = customRoles;
        classStateStore.getClassroom(id).availableRoles = availableRoles;
    }

    // Get all students in the class and add them to the classroom
    const classStudents = await getStudentsInClass(id);
    for (const studentEmail in classStudents) {
        // If the student is already in the class, skip
        if (classStateStore.getClassroomStudent(id, studentEmail)) continue;

        const student = classStudents[studentEmail];

        student.isOffline = true;

        student.displayName = student.displayName || student.email;
        classStateStore.setUser(studentEmail, student);
        classStateStore.setClassroomStudent(id, studentEmail, student);
    }
}

/**
 * Starts a class session by activating the class, emitting the start class event,
 * and updating the class state in memory and to connected clients.
 * @param {string|number} classId - The ID of the class to start.
 * @returns {Promise<void>}
 */
async function startClass(classId) {
    await advancedEmitToClass("startClassSound", classId, { api: true });

    // Activate the class and send the class active event
    classStateStore.getClassroom(classId).isActive = true;
    advancedEmitToClass("isClassActive", classId, {}, classStateStore.getClassroom(classId).isActive);
    broadcastClassUpdate(classId);
}

/**
 * Ends a class session by deactivating the class, emitting the end class event,
 * and updating the class state in memory and to connected clients.
 * @param {string|number} classId - The ID of the class to end.
 * @param {Object} [userSession] - The session object of the user ending the class.
 * @returns {Promise<void>}
 */
async function endClass(classId, userSession) {
    await advancedEmitToClass("endClassSound", classId, { api: true });

    // Deactivate the class and send the class active event
    classStateStore.getClassroom(classId).isActive = false;

    // You may notice that we're not calling a classUpdate here.
    // This is because clearPoll indirectly calls it. Sorry.
    await clearPoll(classId, userSession, true);

    advancedEmitToClass("isClassActive", classId, {}, classStateStore.getClassroom(classId).isActive);
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

    if (!user && !classStateStore.getUser(email)) {
        throw new NotFoundError("User is not in database");
    } else if (classStateStore.getUser(email) && classStateStore.getUser(email).isGuest) {
        user = classStateStore.getUser(email);
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

    // If the user is the owner of the classroom, ensure they have a classUser entry
    if (classroomDb.owner === user.id) {
        if (!classUser) {
            classUser = {};
        }
    }

    if (classUser) {
        // Get the student's session data
        let currentUser = classStateStore.getUser(email);
        const classroom = classStateStore.getClassroom(classId);

        // Load multi-role assignments from user_roles
        const roleAssignments = await getStudentRoleAssignments(classId, currentUser.id);
        const roleRefs = buildRoleReferences(roleAssignments);
        currentUser.roles = { global: currentUser.roles?.global || [], class: roleRefs };
        currentUser.isClassOwner = classroomDb.owner === user.id;
        currentUser.isOffline = false;

        // If the user is banned, don't let them join
        if (getAssignedClassScopes(currentUser, classroom).includes(SCOPES.CLASS.SYSTEM.BLOCKED) && !currentUser.isClassOwner) {
            throw new ForbiddenError("You are banned from that class");
        }
        currentUser.activeClass = classId;

        // Add the student to the class
        classStateStore.setClassroomStudent(classId, email, currentUser);

        // Set the active class of the user
        classStateStore.getUser(email).activeClass = classId;
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
            await dbRun("INSERT INTO classusers(classId, studentId) VALUES(?, ?)", [classId, user.id]);
        }

        // Grab the user from the users list
        const classData = classStateStore.getClassroom(classId);
        let currentUser = classStateStore.getUser(email);
        const isOwner = currentUser.id === classData.owner;
        currentUser.roles = { global: currentUser.roles?.global || [], class: [] };
        currentUser.isClassOwner = isOwner;
        currentUser.activeClass = classId;

        // Add the student to the class
        classStateStore.setClassroomStudent(classId, email, currentUser);

        classStateStore.getUser(email).activeClass = classId;

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

    const isGuest = !!classStateStore.getUser(email)?.isGuest;
    if (isGuest) {
        throw new ForbiddenError("Guests must enroll in classes with a class code");
    }

    // Check if the user is in the class to prevent people from joining classes just from the class ID
    const studentId = await getIdFromEmail(email);
    const classUsers = await dbGet("SELECT * FROM classusers WHERE studentId=? AND classId=?", [studentId, classId]);
    const classroomOwner = await dbGet("SELECT owner FROM classroom WHERE id=?", [classId]);

    // User must either be in classusers table or be the owner of the classroom.
    if (!classUsers && (!classroomOwner || classroomOwner.owner !== studentId)) {
        throw new ForbiddenError("You are not in that class");
    }

    // Initialize classroom if not already loaded
    if (!classStateStore.getClassroom(classId)) {
        await initializeClassroom(classId);
    }

    // Add user to classroom session
    const response = await addUserToClassroomSession(classId, email, userData);

    // Update all user sockets with the new class
    const userSockets = socketStateStore.getUserSocketsByEmail(email);
    if (response === true && userSockets) {
        for (const userSocket of Object.values(userSockets)) {
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
async function leaveClass(userData, classId) {
    // If no classId is provided, use the user's active class
    if (!classId) {
        classId = userData.activeClass;
    }

    const email = userData.email;
    const user = classStateStore.getUser(email);
    if (!user || user.activeClass !== classId) {
        throw new NotFoundError("User is not in the specified class");
    }

    // Kick the user from the classroom entirely if they're a guest
    // If not, kick them from the session
    await advancedEmitToClass("leaveSound", classId, {});
    await classKickStudent(user.id, classId, { exitRoom: classStateStore.getUser(email).isGuest });
    return true;
}

/**
 * Checks if the class with the given classId is currently active.
 * @param {number} classId - The ID of the class to check.
 * @returns {boolean} True if the class is active, false otherwise.
 */
function isClassActive(classId) {
    const classroom = classStateStore.getClassroom(classId);
    if (!classroom) {
        return false;
    }

    return classroom.isActive;
}

/**
 * Deletes all classrooms owned by the specified user, along with related data
 * * (class users, polls, links) and in-memory session state.
 * @param {number|string} userId - The ID of the user whose classrooms should be deleted.
 * @returns {Promise<void>}
 */
async function deleteClassrooms(userId) {
    const classrooms = await dbGetAll("SELECT * FROM classroom WHERE owner=?", userId);
    if (classrooms.length == 0) return;

    await dbRun("DELETE FROM classroom WHERE owner=?", classrooms[0].owner);
    for (const classroom of classrooms) {
        if (classStateStore.getClassroom(classroom.id)) {
            await endClass(classroom.id);
        }

        await Promise.all([
            dbRun("DELETE FROM classusers WHERE classId=?", classroom.id),
            dbRun("DELETE FROM class_polls WHERE classId=?", classroom.id),
            dbRun("DELETE FROM links WHERE classId=?", classroom.id),
        ]);
        invalidateClassPollCache(classroom.id);
        classCodeCacheStore.invalidateByClassId(classroom.id);
    }
}

// Kick

/**
 * Kicks a student from a class.
 * If exitRoom is true, fully removes them; otherwise just removes from session.
 * @param {number} userId - User ID.
 * @param {number} classId - Class ID.
 * @param {Object} options - Kick options.
 * @returns {Promise<void>}
 */
async function classKickStudent(userId, classId, options = { exitRoom: true, ban: false }) {
    const email = await getEmailFromId(userId);
    if (!email) {
        throw new NotFoundError("User is not in the specified class");
    }

    const classroom = classStateStore.getClassroom(classId);
    const classroomStudent = classroom ? classroom.students[email] : null;
    const classMembership = await dbGet("SELECT 1 FROM classusers WHERE classId=? AND studentId=?", [classId, userId]);
    if (!classroomStudent && !classMembership) {
        throw new NotFoundError("User is not in the specified class");
    }

    const existingUser = classStateStore.getUser(email);
    if (existingUser) {
        const user = existingUser;
        user.activeClass = null;
        user.break = false;
        user.help = false;

        if (options.ban) {
            const blockedRole = findAvailableRoleByScope(classroom, SCOPES.CLASS.SYSTEM.BLOCKED);
            user.roles = {
                global: user.roles?.global || [],
                class: blockedRole ? buildRoleReferences([blockedRole]) : [],
            };
        }
        setClassOfApiSockets(existingUser.API, null);
    }

    if (classroom && classroomStudent) {
        const student = classroomStudent;

        // Remove all class roles from the student
        const studentClassRoles = (await getUserRoles(userId)).class
        if (studentClassRoles) studentClassRoles.forEach(role => removeStudentRole(classId, userId, role.id))

        student.pollRes = {}
        student.help = false
        student.break = false

        student.activeClass = null;
        student.break = false;
        student.help = false;
        student.isOffline = true;
        if (classStateStore.getUser(email)) {
            classStateStore.setUser(email, student);
        }

        if (student.isGuest) {
            classStateStore.removeClassroomStudent(classId, email);
        }
    }

    if (options.exitRoom && !options.ban) {
        await dbRun("DELETE FROM classusers WHERE studentId=? AND classId=?", [userId, classId]);
        if (classroom) {
            classStateStore.removeClassroomStudent(classId, email);
        }
    }

    const classOwner = await dbGet("SELECT owner FROM classroom WHERE id=?", [classId]);
    if (classOwner) {
        const ownerEmail = await getEmailFromId(classOwner.owner);
        userUpdateSocket(ownerEmail, "classUpdate", classId);
    }

    const usersSockets = socketStateStore.getUserSocketsByEmail(email);
    if (usersSockets) {
        for (const userSocket of Object.values(usersSockets)) {
            userSocket.leave(`class-${classId}`);
            userSocket.request.session.classId = null;
            userSocket.request.session.save();
            userSocket.emit("reload");
        }
    }
}

/**
 * Kicks all non-teacher students from a class.
 * @param {number} classId - Class ID.
 * @returns {Promise<void>}
 */
async function classKickStudents(classId) {
    try {
        const classroom = classStateStore.getClassroom(classId);
        if (!classroom) return;

        const kickOperations = [];
        for (const student of Object.values(classroom.students)) {
            if (userHasScope(student, SCOPES.CLASS.SYSTEM.ADMIN, classroom) || userHasAnyScope(student, CLASS_TEACHER_SCOPES, classroom)) {
                continue;
            }

            kickOperations.push(classKickStudent(student.id, classId));
        }

        if (kickOperations.length > 0) {
            await Promise.all(kickOperations);
        }
    } catch (err) { }
}

/**
 * Regenerates the classroom join code and updates cache/state.
 * @param {number|string} classId
 * @returns {Promise<string>} The new classroom code.
 */
async function regenerateClassCode(classId) {
    requireInternalParam(classId, "classId");

    const classroom = await dbGet("SELECT key FROM classroom WHERE id = ?", [classId]);
    if (!classroom) {
        throw new NotFoundError("Classroom not found");
    }

    const accessCode = generateKey(4);
    await dbRun("UPDATE classroom SET key=? WHERE id=?", [accessCode, classId]);

    const loadedClassroom = classStateStore.getClassroom(classId);
    if (loadedClassroom) {
        classStateStore.updateClassroom(classId, { key: accessCode });
    }

    if (classroom.key) {
        classCodeCacheStore.delete(classroom.key);
    }
    classCodeCacheStore.set(accessCode, Number(classId));

    return accessCode;
}

/**
 * Broadcasts a class update using any connected socket in the class.
 * Prefers a specific user's sockets first when provided.
 * @param {number} classId - Class ID.
 * @param {string} preferredEmail - Email to update first.
 * @returns {void}
 */
function broadcastClassUpdate(classId, preferredEmail) {
    if (!classId) return false;

    if (preferredEmail && userUpdateSocket(preferredEmail, "classUpdate", classId)) {
        return true;
    }

    const classroom = classStateStore.getClassroom(classId);
    if (!classroom || !classroom.students) {
        return false;
    }

    for (const email of Object.keys(classroom.students)) {
        if (email === preferredEmail) continue;
        if (userUpdateSocket(email, "classUpdate", classId)) {
            return true;
        }
    }

    return false;
}

// Break

/**
 * Requests a break for a student.
 * @param {string} reason - Break reason.
 * @param {Object} userData - Session user data.
 * @param {number} classId - Student's current class ID.
 * @returns {void}
 */
function requestBreak(reason, userData, classId) {
    const email = userData.email;
    if (!classStateStore.getClassroom(classId)?.isActive) {
        return "This class is not currently active.";
    }

    const classroom = classStateStore.getClassroom(classId);
    const student = classroom.students[email];
    advancedEmitToClass("breakSound", classId, {});
    student.break = reason;

    broadcastClassUpdate(classId, email);
    return true;
}

/**
 * Approves or denies a break for a student.
 * @param {boolean} breakApproval - Whether the break is approved.
 * @param {number} userId - Student user ID.
 * @param {Object} userData - Session user data.
 * @param {number} classId - Student's current class ID.
 * @returns {Promise<boolean|string>}
 */
async function approveBreak(breakApproval, userId, userData, classId) {
    const email = await getEmailFromId(userId);

    const student = classStateStore.getClassroomStudent(classId, email);
    classStateStore.updateClassroomStudent(classId, email, { break: breakApproval });

    io.to(`user-${email}`).emit("break", breakApproval);
    if (student && student.API) {
        io.to(`api-${student.API}`).emit("break", breakApproval);
    }
    broadcastClassUpdate(classId, userData.email || email);
    return true;
}

/**
 * Ends a student's active break.
 * @param {Object} userId - Session user id.
 * @param {number} classId - Student's current class ID.
 * @returns {void}
 */
async function endBreak(userId, classId) {
    const email = await getEmailFromId(userId);
    const student = classStateStore.getClassroomStudent(classId, email);
    classStateStore.updateClassroomStudent(classId, email, { break: false });

    io.to(`user-${email}`).emit("break", false);
    if (student && student.API) {
        io.to(`api-${student.API}`).emit("break", false);
    }
    broadcastClassUpdate(classId, email);
}

// Help

/**
 * Sends a help ticket for a student.
 * @param {string} reason - Help reason.
 * @param {Object} userSession - Session user data.
 * @param {number} classId - Student's current class ID.
 * @returns {void}
 */
function sendHelpTicket(reason, userSession, classId) {
    const email = userSession.email;
    if (!classStateStore.getClassroom(classId)?.isActive) {
        return "This class is not currently active.";
    }

    const student = classStateStore.getClassroomStudent(classId, email);
    if (student.help.reason === reason) {
        return "You have already requested help for this reason.";
    }

    const time = Date.now();
    classStateStore.updateClassroomStudent(classId, email, { help: { reason: reason, time: time } });

    emitToUser(email, "helpSuccess");
    advancedEmitToClass("helpSound", classId, {});

    broadcastClassUpdate(classId, email);
    return true;
}

/**
 * Deletes a help ticket for a student.
 * @param {number} studentId - Student user ID.
 * @param {Object} userData - Session user data.
 * @param {number} classId - Student's current class ID.
 * @returns {Promise<void>}
 */
async function deleteHelpTicket(studentId, userData, classId) {
    const email = userData.email;
    const studentEmail = await getEmailFromId(studentId);

    classStateStore.updateClassroomStudent(classId, studentEmail, { help: false });

    broadcastClassUpdate(classId, email);
    return true;
}

// Class Users

/**
 * Gets the users of a class, merging in-memory session data with DB data.
 * @param {Object} user - The requesting user (used for permission-based filtering).
 * @param {string} key - The class key/code.
 * @returns {Promise<Object[]>}
 */
async function getClassUsers(user, key) {
    const dbClassUsers = await new Promise((resolve, reject) => {
        database.all(
            "SELECT DISTINCT users.id, users.email, users.pog_meter FROM users INNER JOIN classroom ON classroom.key = ? LEFT JOIN classusers ON users.id = classusers.studentId AND classusers.classId = classroom.id WHERE users.id = classroom.owner OR classusers.studentId IS NOT NULL",
            [key],
            (err, rows) => {
                if (err) return reject(err);
                if (!rows) return resolve({ error: "class does not exist" });
                resolve(rows);
            }
        );
    });

    if (dbClassUsers.error) return dbClassUsers;

    let classUsers = {};
    let cDClassUsers = {};
    let classId = await getClassIDFromCode(key);

    const cdClassroom = classId ? classStateStore.getClassroom(classId) : null;
    const requesterCanViewTeacherState =
        cdClassroom && user
            ? userHasScope(user, SCOPES.CLASS.SYSTEM.ADMIN, cdClassroom) || userHasAnyScope(user, CLASS_TEACHER_SCOPES, cdClassroom)
            : false;
    const requesterCanViewModState =
        requesterCanViewTeacherState || (cdClassroom && user ? userHasAnyScope(user, CLASS_MOD_SCOPES, cdClassroom) : false);
    if (cdClassroom) {
        cDClassUsers = cdClassroom.students || {};
    }

    for (let userRow of dbClassUsers) {
        classUsers[userRow.email] = {
            loggedIn: false,
            ...userRow,
            help: null,
            break: null,
            pogMeter: userRow.pog_meter || 0,
        };

        let cdUser = cDClassUsers[userRow.email];
        if (cdUser) {
            classUsers[userRow.email].loggedIn = true;
            classUsers[userRow.email].help = cdUser.help;
            classUsers[userRow.email].break = cdUser.break;
            classUsers[userRow.email].pogMeter = cdUser.pogMeter;
            classUsers[userRow.email].roles = {
                global: classUsers[userRow.email].roles?.global || [],
                class: cdUser.roles?.class || [],
            };
        }

        if (!requesterCanViewTeacherState) {
            if (classUsers[userRow.email].help) {
                classUsers[userRow.email].help = true;
            }
            if (typeof classUsers[userRow.email].break == "string") {
                classUsers[userRow.email].break = false;
            }
        }

        if (!requesterCanViewModState) {
            delete classUsers[userRow.email].help;
            delete classUsers[userRow.email].break;
            delete classUsers[userRow.email].pogMeter;
        }
    }

    return classUsers;
}

// Timer

/**
 * Get the active timer for a class.
 * @param {number} classId - classId.
 * @returns {Object|null}
 */
function getTimer(classId) {
    const classroom = classStateStore.getClassroom(classId);
    if (!classroom) return;

    return classroom.timer;
}

/**
 * Start a class timer.
 * @param {Object} timerData - Timer data.
 * @param {number} timerData.classId - Class ID.
 * @param {number} timerData.duration - Timer duration in milliseconds.
 * @param {string} [timerData.sound] - Completion sound.
 * @returns {Object}
 */
function startTimer({ classId, duration, sound }) {
    const classroom = classStateStore.getClassroom(classId);
    if (!classroom) return;

    const startTime = Date.now();
    const endTime = startTime + duration;

    classStateStore.updateClassroom(classId, {
        timer: {
            startTime,
            endTime,
            active: true,
            sound: sound ?? false,
        },
    });

    broadcastClassUpdate(classId);
}

/**
 * Resume a paused class timer.
 * @param {number} classId - classId.
 * @returns {Object|null}
 */
function resumeTimer(classId) {
    const classroom = classStateStore.getClassroom(classId);
    if (!classroom) return;

    const timer = classroom.timer;
    // Ensure there is a timer to resume
    if (!timer) return;
    // Only resume if the timer is currently inactive/paused
    if (timer.active) return;
    const pausedAt = timer.pausedAt;
    // Ensure pausedAt is a finite number before resuming
    if (typeof pausedAt !== "number" || !Number.isFinite(pausedAt)) return;
    // Ensure startTime and endTime are finite numbers to avoid NaN
    if (
        typeof timer.startTime !== "number" ||
        !Number.isFinite(timer.startTime) ||
        typeof timer.endTime !== "number" ||
        !Number.isFinite(timer.endTime)
    )
        return;
    const now = Date.now();
    const pauseDelta = now - pausedAt;

    classStateStore.updateClassroom(classId, {
        timer: {
            ...timer,
            startTime: timer.startTime + pauseDelta,
            endTime: timer.endTime + pauseDelta,
            active: true,
            // Clear pausedAt so subsequent resumes do not re-shift the timer
            pausedAt: undefined,
        },
    });

    broadcastClassUpdate(classId);
}

/**
 * Pause a class timer.
 * @param {number} classId - classId.
 * @returns {Object|null}
 */
function pauseTimer(classId) {
    const classroom = classStateStore.getClassroom(classId);
    if (!classroom) return;

    const timer = classroom.timer;
    if (
        !timer ||
        typeof timer.startTime !== "number" ||
        !Number.isFinite(timer.startTime) ||
        typeof timer.endTime !== "number" ||
        !Number.isFinite(timer.endTime)
    ) {
        return;
    }

    classStateStore.updateClassroom(classId, {
        timer: {
            ...timer,
            active: false,
            pausedAt: Date.now(),
        },
    });

    broadcastClassUpdate(classId);
}

/**
 * End a class timer.
 * @param {number} classId - classId.
 * @returns {Object|null}
 */
function endTimer(classId) {
    const classroom = classStateStore.getClassroom(classId);
    if (!classroom) return;

    classStateStore.updateClassroom(classId, {
        timer: {
            ...(classroom.timer || {}),
            active: false,
        },
    });

    broadcastClassUpdate(classId);
}

/**
 * Clear a class timer.
 * @param {number} classId - classId.
 * @returns {Object|null}
 */
function clearTimer(classId) {
    const classroom = classStateStore.getClassroom(classId);
    if (!classroom) return;

    classStateStore.updateClassroom(classId, {
        timer: {
            startTime: 0,
            endTime: 0,
            active: false,
            sound: false,
        },
    });

    broadcastClassUpdate(classId);
}

/**
 * Clears poll votes from students who should be excluded based on class settings,
 * permission levels, break status, and offline status.
 * @param {string|number} classId
 * @returns {void}
 */
function clearVotesFromExcludedStudents(classId) {
    const classData = classStateStore.getClassroom(classId);
    if (!classData) return;

    const excludedEmails = [];

    for (const student of Object.values(classData.students)) {
        let shouldExclude = false;
        const accessProfile = getClassAccessProfile(student, classData);

        if (classData.poll && classData.poll.excludedRespondents && classData.poll.excludedRespondents.includes(student.id)) {
            shouldExclude = true;
        }

        if (classData.settings && classData.settings.isExcluded) {
            if (classData.settings.isExcluded.guests && accessProfile.category === "guest") {
                shouldExclude = true;
            }
            if (classData.settings.isExcluded.mods && accessProfile.category === "mod") {
                shouldExclude = true;
            }
            if (classData.settings.isExcluded.teachers && accessProfile.category === "teacher") {
                shouldExclude = true;
            }
        }

        if (student.break === true) {
            shouldExclude = true;
        }

        if (student.isOffline || accessProfile.isTeacher || accessProfile.isManager) {
            shouldExclude = true;
        }

        if (shouldExclude) {
            excludedEmails.push(student.email);
        }
    }

    for (const email of excludedEmails) {
        const student = classData.students[email];
        if (student && student.pollRes) {
            student.pollRes.buttonRes = "";
            student.pollRes.textRes = "";
            student.pollRes.date = null;
        }
    }
}

/**
 * Updates one or more class settings in memory and broadcasts the changes via socket.
 *
 * @param {string|number} classId - The unique identifier of the class.
 * @param {Object} classSettings - Partial object of class settings to update.
 * @returns {Promise<void>} Resolves when the settings have been updated and broadcasted.
 */
async function updateClassSetting(classId, classSettings) {
    requireInternalParam(classId, "classId");
    requireInternalParam(classSettings, "classSettings");

    const classroom = classStateStore.getClassroom(classId);
    if (!classroom) {
        throw new NotFoundError("Class not started");
    }

    // When more settings are added, this should be refactored
    const newClassName = classSettings.name;
    if (newClassName != null) {
        if (typeof newClassName !== "string") {
            throw new ValidationError("The new class name must be a string");
        }

        const normalizedName = newClassName.trim();
        const validation = validateClassroomName(normalizedName);
        if (!validation.valid) {
            throw new ValidationError(validation.error);
        }

        await dbRun("UPDATE classroom SET name = ? WHERE id = ?", [normalizedName, classId]);
        classStateStore.updateClassroom(classId, { className: normalizedName });
        broadcastClassUpdate(classId);
        return;
    }

    throw new ValidationError("Invalid setting provided.");
}

module.exports = {
    getUserJoinedClasses,
    getClassCode,
    validateClassroomName,
    initializeClassroom,
    addUserToClassroomSession,
    createClass,
    startClass,
    endClass,
    joinClass,
    leaveClass,
    isClassActive,
    deleteClassrooms,
    classKickStudent,
    classKickStudents,
    requestBreak,
    approveBreak,
    endBreak,
    sendHelpTicket,
    deleteHelpTicket,
    getClassUsers,
    getTimer,
    startTimer,
    endTimer,
    clearTimer,
    resumeTimer,
    pauseTimer,
    clearVotesFromExcludedStudents,
    updateClassSetting,
    regenerateClassCode,
    broadcastClassUpdate,
};
