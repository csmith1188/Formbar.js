const { classInformation } = require("../modules/class/classroom")
const { database, dbRun, dbGetAll } = require("../modules/database")
const { logger } = require("../modules/logger")
const { TEACHER_PERMISSIONS } = require("../modules/permissions")
const { getUserClass } = require("../modules/user/user")
const { io } = require("../modules/webServer")
const jwt = require("jsonwebtoken");

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
        // Unlike for verified users, unverified users will have their secret for the ID
        socket.on("verifyChange", async (id) => {
            try {
                logger.log('info', `[verifyUser] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[verifyUser] user=(${id})`)

                // Get the user from the temp users table
                const tempUsers = await dbGetAll('SELECT * FROM temp_user_creation_data');
                let tempUser;
                for (const user of tempUsers) {
                    const userData = jwt.decode(user.token);
                    if (userData.newSecret == id) {
                        tempUser = userData;
                        break;
                    }
                }

                // If a temp user wasn't found, exit
                // Otherwise, insert their data into the users table, and delete them from the temp user table.
                if (!tempUser) return;
                await dbRun('INSERT INTO users (email, password, permissions, API, secret, displayName, verified) VALUES (?, ?, ?, ?, ?, ?, ?)', [tempUser.email, tempUser.hashedPassword, tempUser.permissions, tempUser.newAPI, tempUser.newSecret, tempUser.displayName, 1]);
                await dbRun('DELETE FROM temp_user_creation_data WHERE secret=?', [tempUser.newSecret]);
            } catch (err) {
                logger.log('error', err.stack);
            }
        })
    }
}