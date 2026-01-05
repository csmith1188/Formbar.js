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

        logger.log("info", `[requestBreak] session=(${JSON.stringify(userSession)})`);
        logger.log("info", `[requestBreak] reason=(${reason})`);

        // Get the student, play the break sound, and set the break reason
        const classroom = classInformation.classrooms[classId];
        const student = classroom.students[email];
        advancedEmitToClass("breakSound", classId, {});
        student.break = reason;

        logger.log("verbose", `[requestBreak] user=(${JSON.stringify(classroom.students[email])})`);
        userUpdateSocket(email, "classUpdate", classId);
        return true;
    } catch (err) {
        logger.log("error", err.stack);
    }
}

async function approveBreak(breakApproval, userId, userSession) {
    try {
        const email = await getEmailFromId(userId);
        logger.log("info", `[approveBreak] session=(${JSON.stringify(userSession)})`);
        logger.log("info", `[approveBreak] breakApproval=(${breakApproval}) email=(${email})`);

        const classId = userSession.classId;
        const classroom = classInformation.classrooms[classId];
        const student = classroom.students[email];
        student.break = breakApproval;
        logger.log("verbose", `[approveBreak] user=(${JSON.stringify(classroom.students[email])})`);

        io.to(`user-${email}`).emit("break", breakApproval);
        io.to(`api-${student.API}`).emit("break", breakApproval);
        userUpdateSocket(email, "classUpdate", classId);
        return true;
    } catch (err) {
        logger.log("error", err.stack);
    }
}

function endBreak(userSession) {
    try {
        logger.log("info", `[endBreak] session=(${JSON.stringify(userSession)})`);

        const classroom = classInformation.classrooms[userSession.classId];
        const student = classInformation.users[userSession.email];
        student.break = false;

        logger.log("verbose", `[endBreak] user=(${JSON.stringify(classroom.students[userSession.email])})`);
        userUpdateSocket(userSession.email, "classUpdate", userSession.classId);
        return true;
    } catch (err) {
        logger.log("error", err.stack);
    }
}

module.exports = {
    requestBreak,
    approveBreak,
    endBreak,
};
