const { classInformation, getClassIDFromCode } = require("../modules/class")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { TEACHER_PERMISSIONS } = require("../modules/permissions")
const { getUserClass } = require("../modules/user")
const { io } = require("../modules/webServer")

module.exports = {
    run(socket, socketUpdates) {
        socket.on('permChange', async (username, newPerm) => {
            try {
                newPerm = Number(newPerm)

                logger.log('info', `[permChange] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[permChange] user=(${username}) newPerm=(${newPerm})`)

                const classCode = getUserClass(username)
                const classId = await getClassIDFromCode(classCode)
                if (classCode instanceof Error) throw classCode

                if (classCode) {
                    classInformation.classrooms[classId].students[username].permissions = newPerm

                    if (classInformation.classrooms[classId].students[username].permissions < TEACHER_PERMISSIONS && Object.keys(classInformation.classrooms[classId].students)[0] == username) {
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