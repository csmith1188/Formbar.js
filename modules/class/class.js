const { logger } = require("../logger");
const { userSocketUpdates } = require("../../sockets/init");
const { advancedEmitToClass, emitToUser, userSockets} = require("../socketUpdates");
const { getIdFromEmail, getEmailFromId} = require("../student");
const { database, dbGet, dbGetAll, dbRun } = require("../database");
const { classInformation } = require('./classroom');
const { joinRoomByCode } = require("../joinRoom");
const { CLASS_SOCKET_PERMISSIONS } = require("../permissions");

/**
 * Starts a class session by activating the class, emitting the start class event,
 * and updating the class state in memory and to connected clients.
 * @param {string|number} classId - The ID of the class to start.
 */
async function startClass(classId) {
    try {
        logger.log('info', `[startClass] classId=(${classId})`);
        await advancedEmitToClass('startClassSound', classId, { api: true });

        // Activate the class and send the class active event
        classInformation.classrooms[classId].isActive = true;
        advancedEmitToClass('isClassActive', classId, { classPermissions: CLASS_SOCKET_PERMISSIONS.isClassActive }, classInformation.classrooms[classId].isActive);

        logger.log('verbose', `[startClass] classInformation=(${JSON.stringify(classInformation)})`);
    } catch (err) {
        logger.log('error', err.stack);
    }
}

/**
 * Ends a class session by deactivating the class, emitting the end class event,
 * and updating the class state in memory and to connected clients.
 * @param {string|number} classId - The ID of the class to end.
 */
async function endClass(classId) {
    try {
        logger.log('info', `[endClass] classId=(${classId})`);
        await advancedEmitToClass('endClassSound', classId, { api: true });

        // Deactivate the class and send the class active event
        classInformation.classrooms[classId].isActive = false;
        advancedEmitToClass('isClassActive', classId, { classPermissions: CLASS_SOCKET_PERMISSIONS.isClassActive }, classInformation.classrooms[classId].isActive);

        logger.log('verbose', `[endClass] classInformation=(${JSON.stringify(classInformation)})`);
    } catch (err) {
        logger.log('error', err.stack);
    }
}

/**
 * Checks if the user has permissions for the perm level that the class has an action set at.
 * For example, manageClass. CLASS_PERMISSIONS contains every one of these permissions, so
 * they're easy to access.
 * @param userId - The user's id to check the permissions of.
 * @param permission - The class permission to check against. Ex: CLASS_PERMISSIONS.MANAGE_CLASS
 * @returns {Promise<Boolean>}
 */
async function checkUserClassPermission(userId, classId, permission) {
    const email = await getEmailFromId(userId);
    const user = classInformation.users[email];
    const classroom = classInformation.classrooms[classId];

    // If the user and classroom are loaded, then check permissions from memory
    if (user && classroom) {
        return user.classPermissions >= classroom.permissions[permission];
    } else {
        // If the user or classroom isn't loaded, then check it from the database
        const classData = await dbGet('SELECT * FROM classroom WHERE id = ?', [classId]);
        const userData = (await dbGet('SELECT permissions FROM classusers WHERE classId = ? AND studentId = ?', [classId, userId]));
        if (!userData) {
            return classData.owner == userId;
        }

        const classPermissions = JSON.parse(classData.permissions);
        return userData.permissions >= classPermissions[permission];
    }
}

/**
 * Allows a user to join a room using a class code.
 * Emits the joinClass event to the user with the result.
 * @param {Object} userSession - The session object of the user attempting to join.
 * @param {string} classCode - The code of the class to join.
 * @returns {Promise<boolean>} Returns true if joined successfully, otherwise emits an error to the user.
 */
async function joinRoom(userSession, classCode) {
	try {
		logger.log('info', `[joinRoom] session=(${JSON.stringify(userSession)}) classCode=${classCode}`);

		const response = await joinRoomByCode(classCode, userSession);
		const email = userSession.email;
        emitToUser(email, 'joinClass', response);
        return true;
	} catch (err) {
		const email = userSession.email;
		emitToUser(email, 'joinClass', 'There was a server error. Please try again');
		logger.log('error', err.stack);
	}
}

/**
 * Removes a user from a class room.
 * Deletes the user from the class in memory and the database, updates the user's session,
 * emits leave events, and reloads the user's page.
 * @param {Object} userSession - The session object of the user leaving the room.
 * @returns {Promise<boolean|undefined>} Returns true if successful, otherwise undefined.
 */
async function leaveRoom(userSession) {
    try {
        const classId = userSession.classId;
        const email = userSession.email;
        const studentId = await getIdFromEmail(email);
        const socketUpdates = userSocketUpdates[email];

        // Remove the user from the class
        delete classInformation.classrooms[classId].students[email];
        classInformation.users[email].activeClass = null;
        classInformation.users[email].classPermissions = null;
        database.run('DELETE FROM classusers WHERE classId=? AND studentId=?', [classId, studentId]);

        // If the owner of the classroom leaves, then delete the classroom
        const owner = (await dbGet('SELECT owner FROM classroom WHERE id=?', classId)).owner;
        if (owner == studentId) {
            await dbRun('DELETE FROM classroom WHERE id=?', classId);
        }

        // Update the class and play leave sound
        socketUpdates.classUpdate(classId);

        // Play leave sound and reload the user's page
        await advancedEmitToClass('leaveSound', classId, {});
        await emitToUser(email, 'reload');
        return true;
    } catch (err) {
        logger.log('error', err.stack)
    }
}

/**
 * Allows a user to join a class by classId.
 * Checks if the user is already in the class, verifies membership, and emits appropriate events.
 * @param {Object} userSession - The session object of the user attempting to join.
 * @param {string|number} classId - The ID of the class to join.
 * @returns {Promise<string|boolean>} Returns true if joined successfully, or an error message string.
 */
async function joinClass(userSession, classId) {
    try {
        logger.log('info', `[joinClass] session=(${JSON.stringify(userSession)}) classId=${classId}`);
        const email = userSession.email;

        // Check if the user is in the class to prevent people from joining classes just from the class ID
        if (classInformation.classrooms[classId] && !classInformation.classrooms[classId].students[email]) {
            return 'You are not in that class.';
        } else if (!classInformation.classrooms[classId]) {
            const studentId = await getIdFromEmail(email);
            const classUsers = (await dbGet('SELECT * FROM classusers WHERE studentId=? AND classId=?', [studentId, classId]));
            if (!classUsers) {
                // The owner of the class is not in classUsers, so we need to check if the user is the owner
                // of the class.
                const classroomOwner = await dbGet('SELECT owner FROM classroom WHERE id=?', classId);
                if (classroomOwner && classroomOwner.owner !== studentId && userSockets[email]) {
                    emitToUser(email, 'joinClass', 'You are not in that class.');
                    return;
                }
            }
        }

        // Retrieve the class code either from memory or the database
        let classCode;
        if (classInformation.classrooms[classId]) {
            classCode = classInformation.classrooms[classId].key;
        } else {
            const classroom = await dbGet('SELECT key FROM classroom WHERE id=?', classId);
            if (classroom && classroom.key) {
                classCode = classroom.key;
            }
        }

        // If there's a class code, then attempt to join the class and emit the response
        const response = await joinRoomByCode(classCode, userSession);
        if (response === true && userSockets[email]) {
            for (const userSocket of Object.values(userSockets[email])) {
                userSocket.request.session.classId = classId;
                userSocket.request.session.save();
                userSocket.emit('joinClass', response);
            }
        }

        return true;
    } catch (err) {
        logger.log('error', err.stack);
        return 'There was a server error. Please try again';
    }
}

/**
 * Removes a user from a class session.
 * Kicks the user from the classroom if they are a guest, or from the session otherwise.
 * Emits leave sound and updates the class state.
 * @param {Object} userSession - The session object of the user leaving the class.
 * @param {string|number} [classId] - The ID of the class to leave. If not provided, uses the user's active class.
 * @returns {boolean} True if the user was removed successfully, false otherwise.
 */
function leaveClass(userSession, classId) {
    try {
        logger.log('info', `[leaveClass] session=(${userSession})`)

        const email = userSession.email;
        const user = classInformation.users[email];
        const socketUpdates = userSocketUpdates[email];
        if (!classId) classId = user.activeClass;
        if (user.activeClass !== classId) {
            return false;
        }

        // Kick the user from the classroom entirely if they're a guest
        // If not, kick them from the session
        advancedEmitToClass('leaveSound', userSession.classId, {});
        socketUpdates.classKickUser(user.id, classId, classInformation.users[email].isGuest);
        return true;
    } catch (err) {
        logger.log('error', err.stack)
    }
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
    try {
        const classrooms = await dbGetAll('SELECT * FROM classroom WHERE owner=?', userId)
        if (classrooms.length == 0) return

        await dbRun('DELETE FROM classroom WHERE owner=?', classrooms[0].owner)
        for (const classroom of classrooms) {
            if (classInformation.classrooms[classroom.id]) {
                await endClass(classroom.id)
            }

            await Promise.all([
                dbRun('DELETE FROM classusers WHERE classId=?', classroom.id),
                dbRun('DELETE FROM class_polls WHERE classId=?', classroom.id),
                dbRun('DELETE FROM plugins WHERE classId=?', classroom.id),
                dbRun('DELETE FROM lessons WHERE class=?', classroom.id)
            ])
        }
    } catch (err) {
        throw err
    }
}

module.exports = {
    startClass,
    endClass,
    joinRoom,
    leaveRoom,
    deleteRooms,
    joinClass,
    leaveClass,
    isClassActive,
    checkUserClassPermission
}