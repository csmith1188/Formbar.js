const { classInformation } = require("./classroom");
const { logger } = require("../logger.js");
const { getEmailFromId } = require("../student");
const { setClassOfApiSockets, userSockets, userUpdateSocket } = require("../socket-updates");
const { dbRun, dbGet } = require("../database");
const { TEACHER_PERMISSIONS, BANNED_PERMISSIONS } = require("../permissions");

// Kicks a student from a class
// If exitRoom is set to true, then it will fully remove the student from the class;
// Otherwise, it will just remove the user from the class session while keeping them registered to the classroom.
async function classKickStudent(userId, classId, options = { exitRoom: true, ban: false }) {
    try {
        const email = await getEmailFromId(userId);

        // Check if user exists in classInformation.users before trying to modify
        if (classInformation.users[email]) {
            // Remove user from class session
            const user = classInformation.users[email];
            user.activeClass = null;
            user.break = false;
            user.help = false;

            // If the user is being banned, set their classPermissions to BANNED_PERMISSIONS
            if (options.ban) {
                user.classPermissions = BANNED_PERMISSIONS;
            }
            setClassOfApiSockets(classInformation.users[email].API, null);
        }

        // Mark the user as offline in the class and remove them from the active classes if the classroom is loaded into memory
        if (classInformation.classrooms[classId] && classInformation.classrooms[classId].students[email]) {
            const student = classInformation.classrooms[classId].students[email];
            student.activeClass = null;
            student.break = false;
            student.help = false;
            student.tags = ["Offline"];
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
                await dbRun("DELETE FROM classusers WHERE studentId=? AND classId=?", [classInformation.users[email].id, classId]);
                delete classInformation.classrooms[classId].students[email];
            }
        }

        // Update the control panel on all tabs
        // @TODO: TEMPORARY FIX - please move update functions outside of a class, or refactor them into the classroom class.
        const classOwner = await dbGet("SELECT owner FROM classroom WHERE id=?", [classId]);
        if (classOwner) {
            const ownerEmail = await getEmailFromId(classOwner.owner);
            userUpdateSocket(ownerEmail, "classUpdate", classId);
        }

        // If the user is logged in, then handle the user's session
        const usersSockets = userSockets[email];
        if (usersSockets) {
            for (const userSocket of Object.values(userSockets[email])) {
                userSocket.leave(`class-${classId}`);
                userSocket.request.session.classId = null;
                userSocket.request.session.save();
                userSocket.emit("reload");
            }
        }
    } catch (err) {
    }
}

function classKickStudents(classId) {
    try {
        for (const student of Object.values(classInformation.classrooms[classId].students)) {
            if (student.classPermissions < TEACHER_PERMISSIONS) {
                classKickStudent(student.id, classId);
            }
        }
    } catch (err) {
    }
}

module.exports = {
    classKickStudent,
    classKickStudents,
};
