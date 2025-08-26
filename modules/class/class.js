const { logger } = require("../logger");
const { userSocketUpdates } = require("../../sockets/init");
const { plugins } = require("../plugins");
const { advancedEmitToClass, userSockets } = require("../socketUpdates");
const { getStudentId } = require("../student");
const { database, dbGet, dbRun } = require("../database");
const { classInformation } = require('./classroom');
const { joinClassroomByCode } = require("../joinClass");

function startClass(socket) {
    try {
        logger.log('info', `[startClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
        const socketUpdates = userSocketUpdates[socket.request.session.email];

        // Enable all plugins
        for (const pluginName of Object.keys(plugins)) {
            const plugin = plugins[pluginName]
            if (typeof plugin.onEnable == 'function') {
                plugin.onEnable()
            } else {
                logger.log('warning', `[startClass] Plugin ${plugin.name} does not have an onEnable function.`)
            }
        }

        // Start the class
        const classId = socket.request.session.classId
        socketUpdates.startClass(classId)

        if (socket.isEmulatedSocket) {
            socket.res.status(200).json({ message: 'Success' });
        }
    } catch (err) {
        logger.log('error', err.stack)
    }
}

async function joinClass(socket, classId) {
    try {
        logger.log('info', `[joinClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)}) classId=${classId}`);
        const email = socket.request.session.email;

        // Check if the user is in the class to prevent people from joining classes just from the class ID
        if (classInformation.classrooms[classId] && !classInformation.classrooms[classId].students[email]) {
            socket.emit('joinClass', 'You are not in that class.');
            return;
        } else if (!classInformation.classrooms[classId]) {
            const studentId = await getStudentId(email);
            const classUsers = (await dbGet('SELECT * FROM classusers WHERE studentId=? AND classId=?', [studentId, classId]));
            if (!classUsers) {
                socket.emit('joinClass', 'You are not in that class.');
                return;
            }
        }

        // Retrieve the class code either from memory or the database
        let classCode;
        if (classInformation.classrooms[classId]) {
            classCode = classInformation.classrooms[classId].key;
        } else {
            classCode = (await dbGet('SELECT key FROM classroom WHERE id=?', classId)).key;
        }

        // If there's a class code, then attempt to join the class and emit the response
        const response = await joinClass(classCode, socket.request.session);
        socket.emit('joinClass', response);
    } catch (err) {
        logger.log('error', err.stack);
        socket.emit('joinClass', 'There was a server error. Please try again');
    }
}

function joinClassroom(socket, classCode) {
    try {
        logger.log('info', `[joinClassroom] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)}) classCode=${classCode}`);

        const response = joinClassroomByCode(classCode, socket.request.session);
        socket.emit("joinClass", response);
    } catch (err) {
        logger.log('error', err.stack);
        socket.emit('joinClass', 'There was a server error. Please try again');
    }
}

function endClass(socket) {
    try {
        logger.log('info', `[endClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
        const socketUpdates = userSocketUpdates[socket.request.session.email];

        // Disable all plugins
        for (const pluginName of Object.keys(plugins)) {
            const plugin = plugins[pluginName]
            if (typeof plugin.onDisable == 'function') {
                plugin.onDisable()
            } else {
                logger.log('warning', `[endClass] Plugin ${plugin.name} does not have an onDisable function.`)
            }
        }

        // End the class
        const classId = socket.request.session.classId
        socketUpdates.endClass(classId)

        if (socket.isEmulatedSocket) {
            socket.res.status(200).json({ message: 'Success' });
        }
    } catch (err) {
        logger.log('error', err.stack)
    }
}

function leaveClass(socket) {
    try {
        logger.log('info', `[leaveClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

        const email = socket.request.session.email;
        const classId = socket.request.session.classId;
        const socketUpdates = userSocketUpdates[email];

        // Kick the user from the classroom entirely if they're a guest
        // If not, kick them from the session
        advancedEmitToClass('leaveSound', socket.request.session.classId, {});
        socketUpdates.classKickUser(email, classId, classInformation.users[email].isGuest);

        if (socket.isEmulatedSocket) {
            socket.res.status(200).json({ message: 'Success' });
        }
    } catch (err) {
        logger.log('error', err.stack)
    }
}

async function leaveClassroom(socket) {
    try {
        const classId = socket.request.session.classId;
        const email = socket.request.session.email;
        const studentId = await getStudentId(email);
        const socketUpdates = userSocketUpdates[email];

        // Remove the user from the class
        delete classInformation.classrooms[classId].students[email];
        classInformation.users[email].activeClasses = classInformation.users[email].activeClasses.filter((c) => c != classId);
        classInformation.users[email].classPermissions = null;
        database.run('DELETE FROM classusers WHERE classId=? AND studentId=?', [classId, studentId]);

        // If the owner of the classroom leaves, then delete the classroom
        const owner = (await dbGet('SELECT owner FROM classroom WHERE id=?', classId)).owner;
        if (owner == studentId) {
            await dbRun('DELETE FROM classroom WHERE id=?', classId);
        }

        // Update the class and play leave sound
        socketUpdates.classPermissionUpdate();
        socketUpdates.virtualBarUpdate();

        // Play leave sound and reload the user's page
        advancedEmitToClass('leaveSound', socket.request.session.classId, {});
        userSockets[email].emit('reload');

        if (socket.isEmulatedSocket) {
            socket.res.status(200).json({ message: 'Success' });
        }
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
    joinClassroom,
    leaveClass,
    leaveClassroom,
    isClassActive
}