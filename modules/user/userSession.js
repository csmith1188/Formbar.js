const { userSockets, managerUpdate } = require("../socketUpdates");
const { classInformation } = require("../class/classroom");
const { database, dbGet, dbRun } = require("../database");
const { logger } = require("../logger");
const { userSocketUpdates } = require("../../sockets/init");
const { deleteCustomPolls } = require("../polls");
const { deleteRooms } = require("../class/class");
const { lastActivities } = require("../../sockets/middleware/inactivity");
const {GUEST_PERMISSIONS} = require("../permissions");

function logout(socket) {
    const email = socket.request.session.email
    const userId = socket.request.session.userId
    const classId = socket.request.session.classId

    // Remove this socket from the user's active sockets first and determine if this was the last one
    let isLastSession = false;
    if (userSockets[email]) {
        delete userSockets[email][socket.id];
        if (Object.keys(userSockets[email]).length === 0) {
            delete userSockets[email];
            isLastSession = true;
        }
    } else {
        isLastSession = true;
    }

    // Leave the room only on this socket
    if (classId) socket.leave(`class-${classId}`)

    socket.request.session.destroy((err) => {
        try {
            if (err) throw err

            // Reload just this client
            socket.emit('reload')

            // If the socket had an associated last activity, remove it
            if (lastActivities[email] && lastActivities[email][socket.id]) {
                delete lastActivities[email][socket.id];
            }

            // Only clear global user/class state if this was the last active session
            if (isLastSession) {
                const user = classInformation.users[email];
                if (user) {
                    user.activeClass = null;
                    user.classPermissions = null;
                }

                // If the user is a guest, then remove them from the global user list
                if (user.permissions === GUEST_PERMISSIONS) {
                    delete classInformation.users[email];
                }

                // If the user was not in a class, then return
                if (!classId) return;

                // If the class is loaded, then mark the user as offline
                const classroom = classInformation.classrooms[classId];
                if (classroom) {
                    const student = classroom.students[email];
                    if (student) {
                        if (student.isGuest) {
                            delete classroom.students[email];
                        } else {
                            student.activeClass = null;

                            // If the student's tags exist and do not include Offline, then add it
                            // Otherwise, if the student's tags do not exist, then set it to Offline
                            if (student.tags && !student.tags.includes('Offline')) {
                                student.tags.push('Offline');
                            } else if (!student.tags) {
                                student.tags = ['Offline'];
                            }
                        }
                    }

                    // Update class permissions and virtual bar
                    const socketUpdates = userSocketUpdates[email];
                    if (socketUpdates) {
                        socketUpdates.classUpdate(classId);
                    }
                }

                // If this user owns the classroom, end it
                database.get(
                    'SELECT * FROM classroom WHERE owner=? AND id=?',
                    [userId, classId],
                    (err, classroom) => {
                        if (err) {
                            logger.log('error', err.stack)
                        }

                        if (classroom) {
                            endClass(classroom.id);
                        }
                    }
                )
            }
        } catch (err) {
            logger.log('error', err.stack)
        }
    })
}

async function deleteUser(userId, userSession) {
    try {
        logger.log('info', `[deleteUser] session=(${JSON.stringify(userSession)})`)
        logger.log('info', `[deleteUser] userId=(${userId})`)

        // Get the user's email from their ID and verify they exist
        const user = await dbGet('SELECT * FROM users WHERE id=?', [userId]);
        if (!user) {
            return 'User not found'
        }

        // Log the user out if they're currently online
        const userSocketsMap = userSockets[user.email];
        const usersSocketUpdates = userSocketUpdates[user.email];
        if (userSocketsMap && usersSocketUpdates) {
            const anySocket = Object.values(userSocketsMap)[0];
            if (anySocket) {
                logout(anySocket);
            }
        }

        try {
            await dbRun('BEGIN TRANSACTION')
            await Promise.all([
                dbRun('DELETE FROM users WHERE id=?', userId),
                dbRun('DELETE FROM classusers WHERE studentId=?', userId),
                dbRun('DELETE FROM shared_polls WHERE userId=?', userId),
            ])

            // await userSocketUpdates.deleteCustomPolls(userId)
            await deleteCustomPolls(userId)
            await deleteRooms(userId) // Delete any rooms owned by the user

            // If the student is online, remove them from any class they're in and update the control panel
            const student = classInformation.users[user.email];
            if (student) {
                const activeClass = classInformation.users[user.email].activeClass;
                const classroom = classInformation.classrooms[activeClass];
                delete classInformation.users[user.email];
                if (classroom) {
                    delete classroom.students[user.email];
                    userSocketUpdates.classUpdate();
                }
            }

            await dbRun('COMMIT')
            await managerUpdate()
            return true
        } catch (err) {
            await dbRun('ROLLBACK')
            throw err
        }
    } catch (err) {
        logger.log('error', err.stack);
        return 'There was an internal server error. Please try again.';
    }
}

module.exports = {
    logout,
    deleteUser
}