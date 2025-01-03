const { classInformation } = require("../modules/class")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { advancedEmitToClass, userSockets, setClassOfApiSockets } = require("../modules/socketUpdates")
const { getStudentId } = require("../modules/student")
const { generateKey } = require("../modules/util")
const { io } = require("../modules/webServer")

module.exports = {
    run(socket, socketUpdates) {
        // Leaves the classroom entirely
        // User is no longer associated with the class
        socket.on('leaveClassroom', async () => {
            try {
                const classId = socket.request.session.classId;
                const username = socket.request.session.username;
                const studentId = await getStudentId(username);

                // Remove the user from the class
                delete classInformation.classrooms[classId].students[username];
                classInformation.users[username].activeClasses = classInformation.users[username].activeClasses.filter((c) => c != classId);
                database.run('DELETE FROM classusers WHERE classId=? AND studentId=?', [classId, studentId]);

                // Update the class and play leave sound
                socketUpdates.classPermissionUpdate();
                socketUpdates.virtualBarUpdate();

                // Play leave sound and reload the user's page
                advancedEmitToClass('leaveSound', socket.request.session.class, { api: true });
                userSockets[username].emit('reload');
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Leaves a classroom session
        // User is still associated with the class
        socket.on('leaveClass', () => {
            try {
                logger.log('info', `[leaveClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const username = socket.request.session.username;
                const classCode = socket.request.session.class;
                const classId = socket.request.session.classId;
                socketUpdates.classKickUser(username, classCode, classId)
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Starts a classroom session
        socket.on('startClass', () => {
            try {
                logger.log('info', `[startClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const classCode = socket.request.session.class
                const classId = socket.request.session.classId
                socketUpdates.startClass(classCode, classId)
            } catch (err) {
                logger.log('error', err.stack)
            }
        });

        // Ends a classroom session
        socket.on('endClass', () => {
            try {
                logger.log('info', `[endClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const classCode = socket.request.session.class
                const classId = socket.request.session.classId
                socketUpdates.endClass(classCode, classId)
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('regenerateClassCode', () => {
            try {
                // Generate a new class code and set it
                const accessCode = generateKey(4);

                // Update the class code in the database
                database.run('UPDATE classroom SET key=? WHERE id=?', [accessCode, socket.request.session.classId], (err) => {
                    try {
                        if (err) throw err;

                        // Update the class code in the class information, session, then refresh the page
                        classInformation.classrooms[socket.request.session.classId].key = accessCode;
                        socket.request.session.class = accessCode;
                        socket.emit("reload");
                    } catch (err) {
                        logger.log('error', err.stack);
                    }
                });
            } catch (err) {
                logger.log('error', err.stack);
            }
        });

        // Deletes a classroom
        socket.on('deleteClass', (classId) => {
            try {
                logger.log('info', `[deleteClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[deleteClass] classId=(${classId})`)

                database.get('SELECT * FROM classroom WHERE id=?', classId, (err, classroom) => {
                    try {
                        if (err) throw err

                        if (classroom) {
                            if (classInformation.classrooms[classId]) {
                                socketUpdates.endClass(classroom.key, classroom.id)
                            }

                            database.run('DELETE FROM classroom WHERE id=?', classroom.id)
                            database.run('DELETE FROM classusers WHERE classId=?', classroom.id)
                            database.run('DELETE FROM poll_history WHERE class=?', classroom.id)
                        }

                        socketUpdates.getOwnedClasses(socket.request.session.username)
                    } catch (err) {
                        logger.log('error', err.stack)
                    }
                })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Kicks a user from the class
        socket.on('classKickUser', (username) => {
            try {
                logger.log('info', `[classKickUser] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[classKickUser] username=(${username})`)

                const classCode = socket.request.session.class
                const classId = socket.request.session.classId
                socketUpdates.classKickUser(username, classCode)
                socketUpdates.classPermissionUpdate(classCode, classId)
                socketUpdates.virtualBarUpdate(classCode)
                advancedEmitToClass('leaveSound', classCode, { api: true })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Deletes all students from the class
        socket.on('classKickStudents', () => {
            try {
                logger.log('info', `[classKickStudents] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const classCode = socket.request.session.class
                const classId = socket.request.session.class
                socketUpdates.classKickStudents(classId)
                socketUpdates.classPermissionUpdate(classCode, classId)
                socketUpdates.virtualBarUpdate(classCode, classId)
                advancedEmitToClass('kickStudentsSound', classCode, { api: true })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('classBanUser', (user) => {
            try {
                logger.log('info', `[ban] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[ban] user=(${user})`)

                let classCode = socket.request.session.class
                logger.log('info', `[ban] classCode=(${classCode})`)

                if (!classCode || classCode == 'noClass') {
                    logger.log('info', '[ban] The user is not in a class.')
                    socket.emit('message', 'You are not in a class')
                    return
                }

                if (!user) {
                    logger.log('critical', '[ban] no username provided.')
                    socket.emit('message', 'No username provided. (Please contact the programmer)')
                    return
                }

                database.run('UPDATE classusers SET permissions = 0 WHERE classId = (SELECT id FROM classroom WHERE key=?) AND studentId = (SELECT id FROM users WHERE username=?)', [
                    socket.request.session.class,
                    user
                ], (err) => {
                    try {
                        if (err) throw err

                        if (classInformation.classrooms[socket.request.session.classId].students[user]) {
                            classInformation.classrooms[socket.request.session.classId].students[user].classPermissions = 0
                        }

                        socketUpdates.classKickUser(user)
                        socketUpdates.classBannedUsersUpdate()
                        socketUpdates.classPermissionUpdate()
                        advancedEmitToClass('leaveSound', classCode, { api: true })
                        socket.emit('message', `Banned ${user}`)
                    } catch (err) {
                        logger.log('error', err.stack)
                        socket.emit('message', 'There was a server error try again.')
                    }
                })
            } catch (err) {
                logger.log('error', err.stack)
                socket.emit('message', 'There was a server error try again.')
            }
        })

        socket.on('classUnbanUser', (user) => {
            try {
                logger.log('info', `[unban] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[unban] user=(${user})`)

                let classCode = socket.request.session.class
                logger.log('info', `[unban] classCode=(${classCode})`)

                if (!classCode || classCode == 'noClass') {
                    logger.log('info', '[unban] The user is not in a class.')
                    socket.emit('message', 'You are not in a class')
                    return
                }

                if (!user) {
                    logger.log('critical', '[unban] no username provided.')
                    socket.emit('message', 'No username provided. (Please contact the programmer)')
                    return
                }

                database.run('UPDATE classusers SET permissions = 1 WHERE classId = (SELECT id FROM classroom WHERE key=?) AND studentId = (SELECT id FROM users WHERE username=?)', [
                    socket.request.session.class,
                    user
                ], (err) => {
                    try {
                        if (err) throw err

                        if (classInformation.classrooms[socket.request.session.classId].students[user])
                            classInformation.classrooms[socket.request.session.classId].students[user].permissions = 1

                        socketUpdates.classBannedUsersUpdate()
                        socket.emit('message', `Unbanned ${user}`)
                    } catch (err) {
                        logger.log('error', err.stack)
                        socket.emit('message', 'There was a server error try again.')
                    }
                })
            } catch (err) {
                logger.log('error', err.stack)
                socket.emit('message', 'There was a server error try again.')
            }
        })

        // Changes permission of user. Takes which user and the new permission level
        socket.on('classPermChange', (user, newPerm) => {
            try {
                logger.log('info', `[classPermChange] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[classPermChange] user=(${user}) newPerm=(${newPerm})`)
                classInformation.classrooms[socket.request.session.classId].students[user].classPermissions = newPerm
                classInformation.users[user].classPermissions = newPerm

                database.run('UPDATE classusers SET permissions=? WHERE classId=? AND studentId=?', [
                    newPerm,
                    classInformation.classrooms[socket.request.session.classId].id,
                    classInformation.classrooms[socket.request.session.classId].students[user].id
                ])

                logger.log('verbose', `[classPermChange] user=(${JSON.stringify(classInformation.classrooms[socket.request.session.classId].students[user])})`)
                io.to(`user-${user}`).emit('reload')

                // cpUpdate()
                // Commented Out to fix Issue #231 checkbox 14, tags not updating when permissions are changed and page is not refreshed
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('setClassPermissionSetting', (permission, level) => {
            try {
                logger.log('info', `[setClassPermissionSetting] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[setClassPermissionSetting] permission=(${permission}) level=(${level})`)

                const classCode = socket.request.session.class
                const classId = socket.request.session.classId
                classInformation.classrooms[classId].permissions[permission] = level
                database.run('UPDATE classroom SET permissions=? WHERE id=?', [JSON.stringify(classInformation.classrooms[classId].permissions), classId], (err) => {
                    try {
                        if (err) throw err

                        logger.log('info', `[setClassPermissionSetting] ${permission} set to ${level}`)
                        socketUpdates.classPermissionUpdate()
                    } catch (err) {
                        logger.log('error', err.stack)
                    }
                })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}