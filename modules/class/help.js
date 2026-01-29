const { classInformation } = require("./classroom");
const { logger } = require("../logger");
const { advancedEmitToClass, emitToUser } = require("../socketUpdates");
const { getEmailFromId } = require("../student");
const { userSocketUpdates } = require("../../sockets/init");

function sendHelpTicket(reason, userSession) {
    try {
        // Get the class id and email from the session
        // Check if the class is inactive before continuing
        const classId = userSession.classId;
        const email = userSession.email;
        if (!classInformation.classrooms[classId].isActive) {
            return "This class is not currently active.";
        }

        // Log the request and deny it if the user has already requested help for the same reason
        const student = classInformation.classrooms[classId].students[email];
        if (student.help.reason === reason) {
            return "You have already requested help for this reason.";
        }

        // Set the student's help ticket to an object with the reason and time of the request
        const time = Date.now();
        student.help = { reason: reason, time: time };

        // Emit an event for the help success and help sound
        emitToUser(email, "helpSuccess");
        advancedEmitToClass("helpSound", classId, {});

        // @TODO: TEMP FIX
        for (const socketUpdates of Object.values(userSocketUpdates[email])) {
            socketUpdates.classUpdate(classId);
            break;
        }
        return true;
    } catch (err) {
    }
}

async function deleteHelpTicket(studentId, userSession) {
    try {
        const classId = userSession.classId;
        const email = userSession.email;
        const studentEmail = await getEmailFromId(studentId);

        // Set the student's help ticket to false, indicating that they are no longer requesting help
        classInformation.classrooms[classId].students[studentEmail].help = false;

        // @TODO: TEMP FIX
        for (const socketUpdates of Object.values(userSocketUpdates[email])) {
            socketUpdates.classUpdate(classId);
            break;
        }
        return true;
    } catch (err) {
    }
}

module.exports = {
    sendHelpTicket,
    deleteHelpTicket,
};
