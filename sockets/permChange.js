const { classInformation } = require("../modules/class/classroom")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { TEACHER_PERMISSIONS } = require("../modules/permissions")
const { getUserClass } = require("../modules/user")
const { io } = require("../modules/webServer")

module.exports = {
    run(socket, socketUpdates) {
        socket.on('permChange', async (email, newPerm) => {
            try {
                newPerm = Number(newPerm)

                logger.log('info', `[permChange] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[permChange] user=(${email}) newPerm=(${newPerm})`)

                const classId = getUserClass(email)
                if (classId instanceof Error) throw classId
                if (classId) {
                    classInformation.classrooms[classId].students[email].permissions = newPerm
                    if (classInformation.classrooms[classId].students[email].permissions < TEACHER_PERMISSIONS && Object.keys(classInformation.classrooms[classId].students)[0] == email) {
                        socketUpdates.endClass(classId)
                    }
                    
                    io.to(`user-${email}`).emit('reload')
                }

                database.run('UPDATE users SET permissions=? WHERE email=?', [newPerm, email])
            } catch (err) {
                logger.log('error', err.stack);
            }
        })
    }
}