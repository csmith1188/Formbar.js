const { isLoggedIn } = require("../modules/authentication")
const { classInformation } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")

module.exports = {
    run(socket, socketUpdates) {
        // Changes permission of user. Takes which user and the new permission level
        socket.on('classPermChange', (user, newPerm) => {
            try {
                logger.log('info', `[classPermChange] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[classPermChange] user=(${user}) newPerm=(${newPerm})`)
                classInformation[socket.request.session.class].students[user].classPermissions = newPerm

                database.run('UPDATE classusers SET permissions=? WHERE classId=? AND studentId=?', [
                    newPerm,
                    classInformation[socket.request.session.class].id,
                    classInformation[socket.request.session.class].students[user].id
                ])

                logger.log('verbose', `[classPermChange] user=(${JSON.stringify(classInformation[socket.request.session.class].students[user])})`)
                io.to(`user-${user}`).emit('reload')

                // cpUpdate()
                // Commented Out to fix Issue #231 checkbox 14, tags not updating when permissions are changed and page is not refreshed
            } catch (err) {
                logger.log('error', err.stack);
            }
        })
    }
}