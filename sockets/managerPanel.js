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

        // For managers to swap a user's verified status
        socket.on("verifyChange", async (id) => {
            try {
                logger.log('info', `[verifyUser] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[verifyUser] user=(${id})`)

                // User from classInformation
                const user = classInformation.users[id]
                if (!user) logger.log('warn', `[verifyUser] Could not find user (${id}) in classInformation.users`)
                
                // Toggle verified status
                user.verified ? user.verified = 0 : user.verified = 1
                database.run('UPDATE users SET verified=? WHERE id=?', [user.verified, id], (err) => {
                    if (err) logger.log('error', err.stack);
                });

                // Notify the user to reload
                io.to(`user-${user.email}`).emit('reload')
            } catch (err) {
                logger.log('error', err.stack);
            }
        })
    }
}