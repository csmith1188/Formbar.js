const { logger } = require("../logger");
const { classInformation } = require("./classroom");
const { advancedEmitToClass, userUpdateSocket } = require("../socketUpdates");
const { getEmailFromId } = require("../student");
const { io } = require("../webServer");

function requestBreak(reason, userSession) {
    try {
        // Get the class id and email from the session
        // Check if the class is inactive before continuing
        const classId = userSession.classId;
        const email = userSession.email;
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

async function approveBreak(breakApproval, userId, userSession) {
    try {
        const email = await getEmailFromId(userId);

        const classId = userSession.classId;
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

function endBreak(userSession) {
    try {
        const classroom = classInformation.classrooms[userSession.classId];
        const student = classInformation.users[userSession.email];
        student.break = false;

        userUpdateSocket(userSession.email, "classUpdate", userSession.classId);
        return true;
    } catch (err) {
    }
}

module.exports = {
    requestBreak,
    approveBreak,
    endBreak,
};
