const { classInformation } = require("./classroom");
const { advancedEmitToClass, userUpdateSocket } = require("../socket-updates");
const { getEmailFromId } = require("../student");
const { io } = require("../web-server");

function requestBreak(reason, userData) {
    try {
        // Get the class id and email from the session
        // Check if the class is inactive before continuing
        const classId = userData.classId;
        const email = userData.email;
        if (!classInformation.classrooms[classId].isActive) {
            return "This class is not currently active.";
        }

        // Get the student, play the break sound, and set the break reason
        const classroom = classInformation.classrooms[classId];
        const student = classroom.students[email];
        advancedEmitToClass("breakSound", classId, {});
        student.break = reason;

        userUpdateSocket(email, "classUpdate", classId);
        return true;
    } catch (err) {
    }
}

async function approveBreak(breakApproval, userId, userData) {
    try {
        const email = await getEmailFromId(userId);

        const classId = userData.classId;
        const classroom = classInformation.classrooms[classId];
        const student = classroom.students[email];
        student.break = breakApproval;

        io.to(`user-${email}`).emit("break", breakApproval);
        if (student && student.API) {
            io.to(`api-${student.API}`).emit("break", breakApproval);
        }
        userUpdateSocket(email, "classUpdate", classId);
        return true;
    } catch (err) {
    }
}

function endBreak(userData) {
    try {

        const classroom = classInformation.classrooms[userData.classId];
        const student = classInformation.users[userData.email];
        student.break = false;
        userUpdateSocket(userData.email, "classUpdate", userData.classId);
        return true;
    } catch (err) {
    }
}

module.exports = {
    requestBreak,
    approveBreak,
    endBreak,
};





