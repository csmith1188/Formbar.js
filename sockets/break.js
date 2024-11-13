const { classInformation } = require("../modules/class")
const { logger } = require("../modules/logger")
const { advancedEmitToClass } = require("../modules/socketUpdates")
const { io } = require("../modules/webServer")

module.exports = {
    run(socket, socketUpdates) {
        // Sends a break ticket
        socket.on('requestBreak', (reason) => {
            try {
                logger.log('info', `[requestBreak] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[requestBreak] reason=(${reason})`)

                const student = classInformation[socket.request.session.class].students[socket.request.session.username]
                if (!student.break != reason) {
                    advancedEmitToClass('breakSound', socket.request.session.class, { api: true })
                }

                student.break = reason
                logger.log('verbose', `[requestBreak] user=(${JSON.stringify(classInformation[socket.request.session.class].students[socket.request.session.username])})`)

                socketUpdates.classPermissionUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Approves the break ticket request
        socket.on('approveBreak', (breakApproval, username) => {
            try {
                logger.log('info', `[approveBreak] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[approveBreak] breakApproval=(${breakApproval}) username=(${username})`)

                const student = classInformation[socket.request.session.class].students[username]
                student.break = breakApproval

                logger.log('verbose', `[approveBreak] user=(${JSON.stringify(classInformation[socket.request.session.class].students[username])})`)

                if (breakApproval) io.to(`user-${username}`).emit('break')
                socketUpdates.classPermissionUpdate()
                socketUpdates.virtualBarUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Ends the break
        socket.on('endBreak', () => {
            try {
                logger.log('info', `[endBreak] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const student = classInformation[socket.request.session.class].students[socket.request.session.username]
                student.break = false

                logger.log('verbose', `[endBreak] user=(${JSON.stringify(classInformation[socket.request.session.class].students[socket.request.session.username])})`)

                socketUpdates.classPermissionUpdate()
                socketUpdates.virtualBarUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}