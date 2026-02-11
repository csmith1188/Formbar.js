const { getLogger, logEvent } = require("@modules/logger");
const { classInformation } = require("@modules/class/classroom");
const { dbGet, dbRun } = require("@modules/database");
const { advancedEmitToClass, emitToUser } = require("@modules/socket-updates");
const { getIdFromEmail } = require("@modules/student");
const { userSocketUpdates } = require("../sockets/init");
const NotFoundError = require("@errors/not-found-error");

// Lazy-load class-service to avoid circular dependency
let classService;
function getClassService() {
    if (!classService) {
        classService = require("@services/class-service");
    }
    return classService;
}

/**
 * Allows a user to join a room using a room code for the FIRST TIME.
 * This function should only be used when a user is joining with a code they received.
 * For rejoining a class the user is already a member of, use joinClass from class-service.
 * Handles loading classroom data, validating user permissions, and updating session state.
 * @param {string} code - The room code to join
 * @param {Object} sessionUser - The user's session object containing email and other data
 * @returns {Promise<boolean>} Returns true if successful
 * @throws {NotFoundError} If no class exists with that code
 * @throws {ForbiddenError} If user is banned from the class
 */
async function joinRoomByCode(code, sessionUser) {
    const logger = await getLogger();
    const email = sessionUser.email;
    logEvent(logger, "info", "room.join_by_code", "User attempting to join room by code", { email, roomCode: code });

    // Find the classroom from the database
    const classroomDb = await dbGet("SELECT * FROM classroom WHERE key=?", [code]);

    // Check to make sure there was a class with that code
    if (!classroomDb) {
        throw new NotFoundError("No class with that code");
    }

    // Initialize classroom if not already loaded
    if (!classInformation.classrooms[classroomDb.id]) {
        await getClassService().initializeClassroom(classroomDb.id);
    }

    // Delegate to class-service to handle the actual joining logic
    // This avoids code duplication and keeps room-service focused on code validation
    const result = await getClassService().addUserToClassroomSession(classroomDb.id, email, sessionUser);

    logEvent(logger, "verbose", "room.join_by_code.success", "User joined room successfully", { email, classId: classroomDb.id });
    return result;
}

/**
 * Allows a user to join a room using a class code.
 * Emits the joinClass event to the user with the result.
 * @param {Object} userSession - The session object of the user attempting to join.
 * @param {string} classCode - The code of the class to join.
 * @returns {Promise<boolean>} Returns true if joined successfully.
 */
async function joinRoom(userSession, classCode) {
    const logger = await getLogger();
    logEvent(logger, "info", "room.join", "User joining room", { email: userSession.email, classCode });

    const response = await joinRoomByCode(classCode, userSession);
    emitToUser(userSession.email, "joinClass", response);
    return true;
}

/**
 * Removes a user from a classroom.
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
    const userSockets = userSocketUpdates.get(email);
    if (userSockets) {
        for (const socketUpdate of userSockets.values()) {
            socketUpdate.classUpdate(classId);
        }
    }

    // Play leave sound and reload the user's page
    await advancedEmitToClass("leaveSound", classId, {});
    await emitToUser(email, "reload");
}

module.exports = {
    joinRoomByCode,
    joinRoom,
    leaveRoom,
};
