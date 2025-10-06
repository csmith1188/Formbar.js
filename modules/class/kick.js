
const { classInformation } = require("./classroom");
const { logger } = require("../logger");
const { getEmailFromId } = require("../student");
const { setClassOfApiSockets, userSockets } = require("../socketUpdates");
const { dbRun } = require("../database");
const { userSocketUpdates } = require("../../sockets/init");

// Kicks a student from a class
// If exitRoom is set to true, then it will fully remove the student from the class;
// Otherwise, it will just remove the user from the class session while keeping them registered to the classroom.
async function classKickStudent(userId, classId, options = { exitRoom: true, ban: false }) {
    try {
        const email = await getEmailFromId(userId);
        logger.log('info', `[classKickUser] email=(${email}) classId=(${classId}) exitRoom=${options.exitRoom}`);

        // Check if user exists in classInformation.users before trying to modify
        if (classInformation.users[email]) {
            // Remove user from class session
            classInformation.users[email].classPermissions = null;
            classInformation.users[email].activeClass = null;
            setClassOfApiSockets(classInformation.users[email].API, null);
        }

        // Mark the user as offline in the class and remove them from the active classes if the classroom is loaded into memory
        if (classInformation.classrooms[classId] && classInformation.classrooms[classId].students[email]) {
            const student = classInformation.classrooms[classId].students[email];
            student.activeClass = null;
            student.tags = ['Offline'];
            if (classInformation.users[email]) {
                classInformation.users[email] = student;
            }

            // If the student is a guest, then remove them from the classroom entirely
            if (student.isGuest) {
                delete classInformation.classrooms[classId].students[email];
            }
        }

        // If exitClass is true, then remove the user from the classroom entirely
        // If the user is a guest, then do not try to remove them from the database
        if (options.exitRoom && classInformation.classrooms[classId]) {
            if (classInformation.users[email] && !classInformation.users[email].isGuest && !options.ban) {
                await dbRun('DELETE FROM classusers WHERE studentId=? AND classId=?', [classInformation.users[email].id, classId]);
            }
            delete classInformation.classrooms[classId].students[email];
        }

        // Update the control panel
        const userSocket = userSockets[email];
        const socketUpdates = userSocketUpdates[email];
        if (socketUpdates) {
            socketUpdates.classUpdate(classId);
        }

        // If the user is logged in, then handle the user's session
        if (userSocket) {
            for (const userSocket of Object.values(userSockets[email])) {
                userSocket.leave(`class-${classId}`);
                userSocket.request.session.classId = null;
                userSocket.request.session.save();
                userSocket.emit('reload');
            }
        }
    } catch (err) {
        logger.log('error', err.stack);
    }
}

function classKickStudents(classId) {
    try {
        logger.log('info', `[classKickStudents] classId=(${classId})`)

        for (const student of Object.values(classInformation.classrooms[classId].students)) {
            if (student.classPermissions < TEACHER_PERMISSIONS) {
                classKickStudent(student.id, classId);
            }
        }
    } catch (err) {
        logger.log('error', err.stack);
    }
}

module.exports = {
    classKickStudent,
    classKickStudents
}