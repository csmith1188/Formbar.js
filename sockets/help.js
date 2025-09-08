const { classInformation } = require("../modules/class/classroom")
const { logger } = require("../modules/logger")
const { advancedEmitToClass } = require("../modules/socketUpdates")

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

                logger.log('info', `[help] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);

                // Set the student's help ticket to an object with the reason and time of the request
                const time = Date.now();
                const student = classInformation.classrooms[classId].students[email];
                student.help = { reason: reason, time: time };

                // Emit helpSuccess if the reason is not the same as the previous one
                // This is to prevent spamming
                logger.log('info', `[help] reason=(${reason}) time=(${time})`);
                if (student.help.reason != reason) {
                    socket.emit('helpSuccess');
                    advancedEmitToClass('helpSound', classId, {});
                }

                logger.log('verbose', `[help] user=(${JSON.stringify(student)}`);
                socketUpdates.classPermissionUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Deletes help ticket
        socket.on('deleteTicket', (student) => {
            try {
                logger.log('info', `[deleteTicket] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[deleteTicket] student=(${student})`)

                // Set the student's help ticket to false, indicating that they are no longer requesting help
                classInformation.classrooms[socket.request.session.classId].students[student].help = false
                logger.log('verbose', `[deleteTicket] user=(${JSON.stringify(classInformation.classrooms[socket.request.session.classId].students[student])})`)

                // Call the classPermissionUpdate function to update the class information with this new data
                socketUpdates.classPermissionUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}