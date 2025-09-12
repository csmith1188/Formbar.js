const { logger } = require("../logger");
const { userSocketUpdates } = require("../../sockets/init");
const { advancedEmitToClass, emitToUser, userSockets} = require("../socketUpdates");
const { getIdFromEmail, getEmailFromId} = require("../student");
const { database, dbGet, dbRun } = require("../database");
const { classInformation } = require('./classroom');
const { joinRoomByCode } = require("../joinClass");
const { CLASS_SOCKET_PERMISSIONS, CLASS_PERMISSIONS} = require("../permissions");

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
        const userData = (await dbGet('SELECT permissions FROM classusers WHERE id = ? AND studentId = ?', [classId, userId]));
        if (!userData) {
            return classData.owner == userId;
        }

        const classPermissions = JSON.parse(classData.permissions);
        return userData.permissions >= classPermissions[permission];
    }
}

async function joinClass(userSession, classId) {
    try {
        logger.log('info', `[joinClass] session=(${JSON.stringify(userSession)}) classId=${classId}`);
        const email = userSession.email;

        // Check if the user is in the class to prevent people from joining classes just from the class ID
        if (classInformation.classrooms[classId] && !classInformation.classrooms[classId].students[email]) {
            // socket.emit('joinClass', );
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
        const response = await joinRoomByCode(classCode, socket.request.session);
        if (response === true) {
            for (const userSocket of Object.values(userSockets[email])) {
                userSocket.request.session.classId = classId;
                userSocket.request.session.save();
                userSocket.emit('joinClass', response);
            }
        }
    } catch (err) {
        logger.log('error', err.stack);
        // socket.emit('joinClass', );
        return 'There was a server error. Please try again';
    }
}

function joinRoom(userSession, classCode) {
    try {
        logger.log('info', `[joinRoom] session=(${JSON.stringify(userSession)}) classCode=${classCode}`);

        const response = joinRoomByCode(classCode, userSession);
        socket.emit("joinClass", response);
    } catch (err) {
        logger.log('error', err.stack);
        socket.emit('joinClass', 'There was a server error. Please try again');
    }
}
//
// function endClass(socket) {
//     try {
//         logger.log('info', `[endClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
//         const socketUpdates = userSocketUpdates[socket.request.session.email];
//
//         // End the class
//         const classId = socket.request.session.classId
//         socketUpdates.endClass(classId)
//
//         if (socket.isEmulatedSocket) {
//             socket.res.status(200).json({ message: 'Success' });
//         }
//     } catch (err) {
//         logger.log('error', err.stack)
//     }
// }

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
        socketUpdates.classUpdate();

        // Play leave sound and reload the user's page
        advancedEmitToClass('leaveSound', userSession.classId, {});
        emitToUser(email, 'reload');
    } catch (err) {
        logger.log('error', err.stack)
    }
}

function isClassActive(classId) {
    const classroom = classInformation.classrooms[classId];
    return classroom.isActive;
}

module.exports = {
    startClass,
    endClass,
    joinClass,
    joinRoom,
    leaveClass,
    leaveRoom,
    isClassActive,
    checkUserClassPermission
}