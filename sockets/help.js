const { isLoggedIn } = require("../modules/authentication")
const { classInformation } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")

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

                socketUpdates.updateClassPermissions()
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}