const { classInformation } = require("../modules/class/classroom")
const { logger } = require("../modules/logger")
const { advancedEmitToClass } = require("../modules/socketUpdates")
const { getEmailFromId } = require("../modules/student");

module.exports = {
    run(socket, socketUpdates) {
        // Sends a help ticket
        socket.on('help', (reason) => {
            try {
                // Get the class id and email from the session
                // Check if the class is inactive before continuing
                const classId = socket.request.session.classId;
                const email = socket.request.session.email;
                if (!classInformation.classrooms[classId].isActive) {
                    socket.emit('message', 'This class is not currently active.');
                    return;
                }

                // Log the request
                logger.log('info', `[help] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);

                // Deny the request if the user has already requested help for the same reason
                const student = classInformation.classrooms[classId].students[email];
                if (student.help.reason === reason) {
                    return;
                }

                // Set the student's help ticket to an object with the reason and time of the request
                const time = Date.now();
                student.help = { reason: reason, time: time };

                // Emit an event for the help success and help sound
                logger.log('info', `[help] reason=(${reason}) time=(${time})`);
                socket.emit('helpSuccess');
                advancedEmitToClass('helpSound', classId, {});

                logger.log('verbose', `[help] user=(${JSON.stringify(student)}`);
                socketUpdates.classUpdate(classId);
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Deletes help ticket
        socket.on('deleteTicket', async (studentId) => {
            try {
                const studentEmail = await getEmailFromId(studentId);
                logger.log('info', `[deleteTicket] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[deleteTicket] student=(${studentEmail})`)

                // Set the student's help ticket to false, indicating that they are no longer requesting help
                classInformation.classrooms[socket.request.session.classId].students[studentEmail].help = false
                logger.log('verbose', `[deleteTicket] user=(${JSON.stringify(classInformation.classrooms[socket.request.session.classId].students[studentEmail])})`)

                // Send new data to the class
                socketUpdates.classUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}