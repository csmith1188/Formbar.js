const { classInformation } = require("../modules/class/classroom")
const { logger } = require("../modules/logger")
const { advancedEmitToClass } = require("../modules/socketUpdates")
const { io } = require("../modules/webServer")

module.exports = {
    run(socket, socketUpdates) {
        // Sends a break ticket
        socket.on('requestBreak', (reason) => {
            try {
                // Get the class id and email from the session
                // Check if the class is inactive before continuing
                const classId = socket.request.session.classId;
                const email = socket.request.session.email;
                if (!classInformation.classrooms[classId].isActive) {
                    socket.emit('message', 'This class is not currently active.');
                    return;
                }

                logger.log('info', `[requestBreak] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);
                logger.log('info', `[requestBreak] reason=(${reason})`);

                // Get the student, play the break sound, and set the break reason
                const student = classInformation.classrooms[classId].students[email];
                advancedEmitToClass('breakSound', classId, {});
                student.break = reason;

                logger.log('verbose', `[requestBreak] user=(${JSON.stringify(classInformation.classrooms[classId].students[email])})`);
                socketUpdates.controlPanelUpdate();
            } catch (err) {
                logger.log('error', err.stack);
            }
        });

        // Approves the break ticket request
        socket.on('approveBreak', (breakApproval, email) => {
            try {
                logger.log('info', `[approveBreak] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[approveBreak] breakApproval=(${breakApproval}) email=(${email})`)

                const student = classInformation.classrooms[socket.request.session.classId].students[email]
                student.break = breakApproval

                logger.log('verbose', `[approveBreak] user=(${JSON.stringify(classInformation.classrooms[socket.request.session.classId].students[email])})`)

                if (breakApproval) io.to(`user-${email}`).emit('break')
                socketUpdates.controlPanelUpdate()
                socketUpdates.virtualBarUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Ends the break
        socket.on('endBreak', () => {
            try {
                logger.log('info', `[endBreak] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const student = classInformation.classrooms[socket.request.session.classId].students[socket.request.session.email]
                student.break = false

                logger.log('verbose', `[endBreak] user=(${JSON.stringify(classInformation.classrooms[socket.request.session.classId].students[socket.request.session.email])})`)

                socketUpdates.controlPanelUpdate()
                socketUpdates.virtualBarUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}