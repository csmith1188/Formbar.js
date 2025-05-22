const { classInformation } = require("../modules/class/classroom")
const { database, dbRun, dbGet } = require("../modules/database")
const { joinClass } = require("../modules/joinClass")
const { logger } = require("../modules/logger")
const { advancedEmitToClass, userSockets, setClassOfApiSockets } = require("../modules/socketUpdates")
const { getStudentId } = require("../modules/student")
const { generateKey } = require("../modules/util")
const { io } = require("../modules/webServer")
const { startClass, endClass, leaveClass, leaveClassroom, isClassActive} = require("../modules/class/class");

module.exports = {
    run(socket, socketUpdates) {
        // Starts a classroom session
        socket.on('startClass', () => {
            startClass(socket);
        });

        // Ends a classroom session
        socket.on('endClass', () => {
            endClass(socket);
        });

        // Join a classroom session
        socket.on('joinClass', async (classId) => {
            try {
                logger.log('info', `[joinClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)}) classId=${classId}`);
                const email = socket.request.session.email;

                // Check if the user is in the class to prevent people from joining classes just from the class ID
                if (classInformation.classrooms[classId] && !classInformation.classrooms[classId].students[email]) {
                    socket.emit('joinClass', 'You are not in that class.');
                    return;
                } else if (!classInformation.classrooms[classId]) {
                    const studentId = await getStudentId(email);
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

        /**
         * Leaves the classroom session
         * The user is still associated with the class, but they're not active in it
         */
        socket.on('leaveClass', () => {
            leaveClass(socket);
        });

        /**
         * Leaves the classroom entirely
         * The user is no longer associated with the class
         */
        socket.on('leaveClassroom', async () => {
            leaveClassroom(socket);
        });

        /**
         * Retrieves the voting rights of a user
         * @param {String} email - email of the user to check.
         */
        socket.on('getCanVote', (email) => {
            try {
                logger.log('info', `[getCanVote] email=(${email}) ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const classId = socket.request.session.classId;
                const studentBoxes = classInformation.classrooms[classId].poll.studentBoxes;
                const canVote = studentBoxes.indexOf(email) > -1;
                socket.emit('getCanVote', canVote);
            } catch (err) {
                logger.log('error', err.stack)
            }
        });

        /**
         * Changes the voting rights of a user or multiple users
         * @param {Object} votingData - An object containing the emails and their voting rights.
         * This should only include emails which should be changed.
         */
        socket.on('changeCanVote', (votingData) => {
            try {
                logger.log('info', `[changeCanVote] votingData=(${JSON.stringify(votingData)}) ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const classId = socket.request.session.classId;
                const studentBoxes = classInformation.classrooms[classId].poll.studentBoxes;
                for (const email in votingData) {
                    const votingRight = votingData[email];
                    if (votingRight) {
                        if (!studentBoxes[email]) {
                            studentBoxes.push(email);
                        }
                    } else {
                        // Remove all instances of the email from the studentBoxes array
                        studentBoxes.splice(0, studentBoxes.length, ...studentBoxes.filter(student => student !== email));
                    }

                    // Emit the voting right to the user
                    if (userSockets[email]) {
                        userSockets[email].emit('getCanVote', votingRight);
                    }
                }
                socketUpdates.virtualBarUpdate(classId);
            } catch(err) {
                logger.log('error', err.stack)
            }
        });

        socket.on('getActiveClass', () => {
            try {
                const api = socket.request.session.api;
                logger.log('info', `[getActiveClass] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                for (const email in classInformation.users) {
                    const user = classInformation.users[email];
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

        /**
         * Sets a setting for the classroom
         * @param {string} setting - A string representing the setting to change.
         * @param {string} value - The value to set the setting to.
         */
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

        /**
         * Checks if the class the user is currently in is active
         * Returns true or false on the same event
         */
        socket.on("isClassActive", () => {
            try {
                logger.log('info', `[isClassActive] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);

                const isActive = isClassActive(socket.request.session.classId);
                socket.emit("isClassActive", isActive);
            } catch (err) {
                logger.log('error', err.stack)
            }
        });

        // Regenerates the class code for the classroom in the teacher's session
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

        /**
         * Changes the class name
         * @param {string} name - The new name of the class.
         */
        socket.on('changeClassName', (name) => {
            try {
                logger.log('info', `[changeClassName] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                if (!name) {
                    socket.emit('message', 'Class name cannot be empty.');
                    return;
                }

                // Update the class name in the database
                database.run('UPDATE classroom SET name=? WHERE id=?', [name, socket.request.session.classId], (err) => {
                    try {
                        if (err) throw err;

                        // Update the class name in the class information
                        classInformation.classrooms[socket.request.session.classId].className = name;
                        socket.emit('changeClassName', name);
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

        /**
         * Deletes a classroom
         * @param {string} classId - The ID of the classroom to delete.
         */
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

                        socketUpdates.getOwnedClasses(socket.request.session.email)
                    } catch (err) {
                        logger.log('error', err.stack)
                    }
                })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        /**
         * Kicks a user from the classroom
         * @param {string} email - The email of the user to kick.
         */
        socket.on('classKickUser', (email) => {
            try {
                logger.log('info', `[classKickUser] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[classKickUser] email=(${email})`)

                const classId = socket.request.session.classId
                socketUpdates.classKickUser(email, classId)
                socketUpdates.classPermissionUpdate(classId)
                socketUpdates.virtualBarUpdate(classId)
                advancedEmitToClass('leaveSound', classId, {})
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        // Removes all students from the class
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

        /**
         * Bans a user from the classroom
         * @param {string} email - The email of the user to ban.
         */
        socket.on('classBanUser', (email) => {
            try {
                logger.log('info', `[ban] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[ban] user=(${email})`)

                let classId = socket.request.session.classId
                logger.log('info', `[ban] classId=(${classId})`)

                if (!classId) {
                    logger.log('info', '[ban] The user is not in a class.')
                    socket.emit('message', 'You are not in a class')
                    return
                }

                if (!email) {
                    logger.log('critical', '[ban] No email provided.')
                    socket.emit('message', 'No email provided. (Please contact the programmer)')
                    return
                }

                database.run('UPDATE classusers SET permissions = 0 WHERE classId = ? AND studentId = (SELECT id FROM users WHERE email=?)', [
                    classId,
                    email
                ], (err) => {
                    try {
                        if (err) throw err

                        if (classInformation.classrooms[socket.request.session.classId].students[email]) {
                            classInformation.classrooms[socket.request.session.classId].students[email].classPermissions = 0
                        }

                        socketUpdates.classKickUser(email)
                        socketUpdates.classBannedUsersUpdate()
                        socketUpdates.classPermissionUpdate()
                        advancedEmitToClass('leaveSound', classId, {})
                        socket.emit('message', `Banned ${email}`)
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

        /**
         * Unbans a user from the classroom
         * @param {string} email - The email of the user to unban.
         */
        socket.on('classUnbanUser', (email) => {
            try {
                logger.log('info', `[unban] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[unban] user=(${email})`)

                let classId = socket.request.session.classId
                logger.log('info', `[unban] classId=(${classId})`)

                if (!classId) {
                    logger.log('info', '[unban] The user is not in a class.')
                    socket.emit('message', 'You are not in a class')
                    return
                }

                if (!email) {
                    logger.log('critical', '[unban] no email provided.')
                    socket.emit('message', 'No email provided. (Please contact the programmer)')
                    return
                }

                database.run('UPDATE classusers SET permissions = 1 WHERE classId = ? AND studentId = (SELECT id FROM users WHERE email=?)', [
                    classId,
                    email
                ], (err) => {
                    try {
                        if (err) throw err

                        if (classInformation.classrooms[classId].students[email])
                            classInformation.classrooms[classId].students[email].permissions = 1

                        socketUpdates.classBannedUsersUpdate()
                        socket.emit('message', `Unbanned ${email}`)
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

        /**
         * Changes permission of user. Takes which user and the new permission level
         * @param {string} email - The email of the user to change permissions for.
         * @param {number} newPerm - The new permission level to set.
         */
        socket.on('classPermChange', (email, newPerm) => {
            try {
                logger.log('info', `[classPermChange] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[classPermChange] user=(${email}) newPerm=(${newPerm})`)
                classInformation.classrooms[socket.request.session.classId].students[email].classPermissions = newPerm
                classInformation.users[email].classPermissions = newPerm

                database.run('UPDATE classusers SET permissions=? WHERE classId=? AND studentId=?', [
                    newPerm,
                    classInformation.classrooms[socket.request.session.classId].id,
                    classInformation.classrooms[socket.request.session.classId].students[email].id
                ])

                logger.log('verbose', `[classPermChange] user=(${JSON.stringify(classInformation.classrooms[socket.request.session.classId].students[email])})`)
                io.to(`user-${email}`).emit('reload')
            } catch (err) {
                logger.log('error', err.stack);
            }
        })

        /**
         * Sets the permission settings for the classroom
         * @param {string} permission - The permission to set.
         * @param {number} level - The level to set the permission to.
         * This can be 1, 2, 3, 4, 5 with guest permissions being 1.
         */
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