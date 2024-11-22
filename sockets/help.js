const { classInformation } = require("../modules/class")
const { logger } = require("../modules/logger")
const { advancedEmitToClass } = require("../modules/socketUpdates")

module.exports = {
    run(socket, socketUpdates) {
        // Sends a help ticket
        socket.on('help', (reason) => {
            try {
                logger.log('info', `[help] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                let time = new Date();

                logger.log('info', `[help] reason=(${reason}) time=(${time})`)

                let student = classInformation[socket.request.session.class].students[socket.request.session.username]

                if (student.help.reason != reason) {
                    advancedEmitToClass('helpSound', socket.request.session.class, { api: true })
                }

                student.help = { reason: reason, time: time }

                logger.log('verbose', `[help] user=(${JSON.stringify(student)}`)

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

                classInformation[socket.request.session.class].students[student].help = false

                logger.log('verbose', `[deleteTicket] user=(${JSON.stringify(classInformation[socket.request.session.class].students[student])})`)

                socketUpdates.classPermissionUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}