const { isLoggedIn } = require("../modules/authentication")
const { classInformation } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { io } = require("../modules/webServer")

module.exports = {
    run(socket, socketUpdates) {
        socket.on('permChange', async (username, newPerm) => {
            try {
                newPerm = Number(newPerm)

                logger.log('info', `[permChange] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[permChange] user=(${username}) newPerm=(${newPerm})`)

                let classCode = getUserClass(username)
                if (classCode instanceof Error) throw classCode

                if (classCode) {
                    classInformation[classCode].students[username].permissions = newPerm

                    if (classInformation[classCode].students[username].permissions < TEACHER_PERMISSIONS && Object.keys(classInformation[classCode].students)[0] == username) {
                        socketUpdates.endClass(classCode)
                    }

                    io.to(`user-${username}`).emit('reload')
                }

                database.run('UPDATE users SET permissions=? WHERE username=?', [newPerm, username])
            } catch (err) {
                logger.log('error', err.stack);
            }
        })
    }
}