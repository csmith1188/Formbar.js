const { classInformation } = require("../modules/class")
const { database, dbRun, dbGet } = require("../modules/database")
const { joinClass } = require("../modules/joinClass")
const { logger } = require("../modules/logger")
const { advancedEmitToClass, userSockets, setClassOfApiSockets } = require("../modules/socketUpdates")
const { getStudentId } = require("../modules/student")
const { generateKey } = require("../modules/util")
const { io } = require("../modules/webServer")

module.exports = {
    run(socket, socketUpdates) {
        // Starts a classroom session
        socket.on('startClass', () => {
            try {
                logger.log('info', `[startClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const classId = socket.request.session.classId
                socketUpdates.startClass(classId)
            } catch (err) {
                logger.log('error', err.stack)
            }
        });

        // Ends a classroom session
        socket.on('endClass', () => {
            try {
                logger.log('info', `[endClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const classId = socket.request.session.classId
                socketUpdates.endClass(classId)
            } catch (err) {
                logger.log('error', err.stack)
            }
        });

        // Join a classroom session
        socket.on('joinClass', async (classId) => {
            try {
                logger.log('info', `[joinClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)}) classId=${classId}`);
                const username = socket.request.session.username;

                // Check if the user is in the class to prevent people from joining classes just from the class ID
                if (classInformation.classrooms[classId] && !classInformation.classrooms[classId].students[username]) {
                    socket.emit('joinClass', 'You are not in that class.');
                    return;
                } else if (!classInformation.classrooms[classId]) {
                    const studentId = await getStudentId(username);
                    const classUsers = (await dbGet('SELECT * FROM classusers WHERE studentId=? AND classId=?', [studentId, classId]));
                    if (!classUsers) {
                        socket.emit('joinClass', 'You are not in that class.');
                        return;
                    }
                }

                // Retrieve the class code either from memory or the database
                let classCode;
                if (classInformation.classrooms[classId]) {
                    classCode = classInformation.classrooms[classId].key;
                } else {
                    classCode = (await dbGet('SELECT key FROM classroom WHERE id=?', classId)).key;
                }

                // If there's a class code, then attempt to join the class and emit the response
                const response = await joinClass(classCode, socket.request.session);
                socket.emit('joinClass', response);
            } catch (err) {
                logger.log('error', err.stack);
                socket.emit('joinClass', 'There was a server error. Please try again');
            }
        });

        socket.on("joinClassroom", async (classCode) => {
            try {
                logger.log('info', `[joinClassroom] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)}) classCode=${classCode}`);
                
                const response = joinClass(classCode, socket.request.session);
                socket.emit("joinClass", response);
            } catch (err) {
                logger.log('error', err.stack);
                socket.emit('joinClass', 'There was a server error. Please try again');
            }
        });

        // Leaves a classroom session
        // User is still associated with the class
        socket.on('leaveClass', () => {
            try {
                logger.log('info', `[leaveClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const username = socket.request.session.username;
                const classId = socket.request.session.classId;

                // Kick the user from the classroom entirely if they're a guest
                // If not, kick them from the session
                socketUpdates.classKickUser(username, classId, classInformation.users[username].isGuest);
            } catch (err) {
                logger.log('error', err.stack)
            }
        });

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
                classInformation.users[username].classPermissions = null;
                database.run('DELETE FROM classusers WHERE classId=? AND studentId=?', [classId, studentId]);

                // If the owner of the classroom leaves, then delete the classroom
                const owner = (await dbGet('SELECT owner FROM classroom WHERE id=?', classId)).owner;
                if (owner == studentId) {
                    await dbRun('DELETE FROM classroom WHERE id=?', classId);
                }

                // Update the class and play leave sound
                socketUpdates.classPermissionUpdate();
                socketUpdates.virtualBarUpdate();

                // Play leave sound and reload the user's page
                advancedEmitToClass('leaveSound', socket.request.session.classId, { api: true });
                userSockets[username].emit('reload');
            } catch (err) {
                logger.log('error', err.stack)
            }
        });

        socket.on('votingRightChange', (username, votingRight, studBox) => {
            try {
                const studentBoxes = classInformation.classrooms[socket.request.session.classId].poll.studentBoxes;

                if (userSockets[username] && studBox) {
                    classInformation.classrooms[socket.request.session.classId].poll.studentBoxes = studBox;
                    userSockets[username].emit('votingRightChange', votingRight);
                    socketUpdates.virtualBarUpdate(socket.request.session.classId);
                } else if (userSockets[username] && username) {
                    if (studentBoxes.length > 0) {
                        userSockets[username].emit('votingRightChange', studentBoxes.includes(username));
                    } else {
                        userSockets[username].emit('votingRightChange', false);
                    }
                }
            } catch (err) {
                logger.log('error', err.stack)
            }
        });

        socket.on('getActiveClass', () => {
            try {
                const api = socket.request.session.api;
                logger.log('info', `[getActiveClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                for (const username in classInformation.users) {
                    const user = classInformation.users[username];
                    if (user.API == api) {
                        setClassOfApiSockets(api, user.activeClasses[0]);
                        return;
                    }
                }

                // If no class is found, set the class to null
                setClassOfApiSockets(api, null);
            } catch (err) {
                logger.log('error', err.stack)
            }
        });

        socket.on("setClassSetting", (setting, value) => {
            try {
                const classId = socket.request.session.classId;
                
                // Update the setting in the classInformation and in the database
                classInformation.classrooms[classId].settings[setting] = value;
                dbRun('UPDATE classroom SET settings=? WHERE id=?', [JSON.stringify(classInformation.classrooms[classId].settings), classId]);
            } catch (err) {
                logger.log('error', err.stack)
            }
            
        });

        socket.on("isClassActive", () => {
            try {
                logger.log('info', `[isClassActive] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);

                const classId = socket.request.session.classId;
                if (classInformation.classrooms[classId].isActive) {
                    socket.emit("isClassActive", true);
                }
            } catch (err) {
                logger.log('error', err.stack)
            }
        });

        socket.on('regenerateClassCode', () => {
            try {
                // Generate a new class code
                const accessCode = generateKey(4);

                // Update the class code in the database
                database.run('UPDATE classroom SET key=? WHERE id=?', [accessCode, socket.request.session.classId], (err) => {
                    try {
                        if (err) throw err;

                        // Update the class code in the class information, session, then refresh the page
                        classInformation.classrooms[socket.request.session.classId].key = accessCode;
                        socket.emit("reload");
                    } catch (err) {
                        logger.log('error', err.stack);
                    }
                });
            } catch (err) {
                logger.log('error', err.stack);
            }
        });

        socket.on('changeClassName', (name) => {
            try {
                if (!name) {
                    socket.emit('message', 'Class name cannot be empty.');
                    return;
                }

                // Update the class name in the database
                database.run('UPDATE classroom SET name=? WHERE id=?', [name, socket.request.session.classId], (err) => {
                    try {
                        if (err) throw err;

                        // Update the class name in the class information
                        classInformation.classrooms[socket.request.session.classId].name = name;
                        socket.emit('message', 'Class name updated.');
                    } catch (err) {
                        logger.log('error', err.stack);
                        socket.emit('message', 'There was a server error try again.');
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

                const classId = socket.request.session.classId
                socketUpdates.classKickUser(username, classId)
                socketUpdates.classPermissionUpdate(classId)
                socketUpdates.virtualBarUpdate(classId)
                advancedEmitToClass('leaveSound', classId, { api: true })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Deletes all students from the class
        socket.on('classKickStudents', () => {
            try {
                logger.log('info', `[classKickStudents] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const classId = socket.request.session.classId
                socketUpdates.classKickStudents(classId)
                socketUpdates.classPermissionUpdate(classId)
                socketUpdates.virtualBarUpdate(classId)
                advancedEmitToClass('kickStudentsSound', classId, { api: true })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('classBanUser', (user) => {
            try {
                logger.log('info', `[ban] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[ban] user=(${user})`)

                let classId = socket.request.session.classId
                logger.log('info', `[ban] classId=(${classId})`)

                if (!classId) {
                    logger.log('info', '[ban] The user is not in a class.')
                    socket.emit('message', 'You are not in a class')
                    return
                }

                if (!user) {
                    logger.log('critical', '[ban] No username provided.')
                    socket.emit('message', 'No username provided. (Please contact the programmer)')
                    return
                }

                database.run('UPDATE classusers SET permissions = 0 WHERE classId = ? AND studentId = (SELECT id FROM users WHERE username=?)', [
                    classId,
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
                        advancedEmitToClass('leaveSound', classId, { api: true })
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

                let classId = socket.request.session.classId
                logger.log('info', `[unban] classId=(${classId})`)

                if (!classId) {
                    logger.log('info', '[unban] The user is not in a class.')
                    socket.emit('message', 'You are not in a class')
                    return
                }

                if (!user) {
                    logger.log('critical', '[unban] no username provided.')
                    socket.emit('message', 'No username provided. (Please contact the programmer)')
                    return
                }

                database.run('UPDATE classusers SET permissions = 1 WHERE classId = ? AND studentId = (SELECT id FROM users WHERE username=?)', [
                    classId,
                    user
                ], (err) => {
                    try {
                        if (err) throw err

                        if (classInformation.classrooms[classId].students[user])
                            classInformation.classrooms[classId].students[user].permissions = 1

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