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
            return 'This class is not currently active.';
        }

        // Log the request and deny it if the user has already requested help for the same reason
        logger.log('info', `[help] session=(${JSON.stringify(userSession)})`);
        const student = classInformation.classrooms[classId].students[email];
        const socketUpdates = userSocketUpdates[email];
        if (student.help.reason === reason) {
            return 'You have already requested help for this reason.';
        }

        // Set the student's help ticket to an object with the reason and time of the request
        const time = Date.now();
        student.help = { reason: reason, time: time };

        // Emit an event for the help success and help sound
        logger.log('info', `[help] reason=(${reason}) time=(${time})`);
        emitToUser(email, 'helpSuccess');
        advancedEmitToClass('helpSound', classId, {});

        logger.log('verbose', `[help] user=(${JSON.stringify(student)}`);
        socketUpdates.classUpdate(classId);
        return true;
    } catch (err) {
        logger.log('error', err.stack)
    }
}

function deleteHelpTicket(studentId, userSession) {
    try {
        const classId = userSession.classId;
        const email = userSession.email;
        const studentEmail = getEmailFromId(studentId);
        logger.log('info', `[deleteTicket] session=(${JSON.stringify(userSession)})`);
        logger.log('info', `[deleteTicket] student=(${studentEmail})`);

        // Set the student's help ticket to false, indicating that they are no longer requesting help
        classInformation.classrooms[classId].students[studentEmail].help = false;
        logger.log('verbose', `[deleteTicket] user=(${JSON.stringify(classInformation.classrooms[classId].students[studentEmail])})`);

        // Send new data to the class
        const socketUpdates = userSocketUpdates[email];
        socketUpdates.classUpdate(classId);
        return true;
    } catch (err) {
        logger.log('error', err.stack);
    }
}

module.exports = {
    sendHelpTicket,
    deleteHelpTicket
}