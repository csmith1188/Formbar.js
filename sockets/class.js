const { classInformation } = require("../modules/class/classroom")
const { database, dbRun } = require("../modules/database")
const { logger } = require("../modules/logger")
const { advancedEmitToClass, setClassOfApiSockets, emitToUser} = require("../modules/socketUpdates")
const { generateKey } = require("../modules/util")
const { io } = require("../modules/webServer")
const { startClass, endClass, leaveClass, leaveRoom, isClassActive, joinRoom, joinClass } = require("../modules/class/class");
const { getEmailFromId } = require("../modules/student");

module.exports = {
    run(socket, socketUpdates) {
        // Starts a classroom session
        socket.on('startClass', () => {
            try {
                const email = socket.request.session.email;
                const classId = classInformation.users[email].activeClass;
                startClass(classId);
            } catch (err) {
                logger.log('error', err.stack);
                socket.emit('startClass', 'There was a server error. Please try again');
            }
        });

        // Ends a classroom session
        socket.on('endClass', () => {
            try {
                const email = socket.request.session.email;
                const classId = classInformation.users[email].activeClass;
                endClass(classId, socket.request.session);
            } catch (err) {
                logger.log('error', err.stack);
                socket.emit('startClass', 'There was a server error. Please try again');
            }
        });

        // Join a classroom session
        socket.on('joinClass', async (classId) => {
            await joinClass(socket.request.session, classId);
        });

        // Joins a classroom
        socket.on('joinRoom', async (classCode) => {
            joinRoom(socket.request.session, classCode);
        });

        /**
         * Leaves the classroom session
         * The user is still associated with the class, but they're not active in it
         */
        socket.on('leaveClass', () => {
            leaveClass(socket.request.session);
        });

        /**
         * Leaves the classroom entirely
         * The user is no longer associated with the class
         */
        socket.on('leaveRoom', async () => {
            await leaveRoom(socket.request.session);
        });

        /**
         * Retrieves the voting rights of a user
         * @param {number} id - The id of the user to check.
         */
        socket.on('getCanVote', async (userId) => {
            try {
                logger.log('info', `[getCanVote] userId=(${userId}) ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const classId = socket.request.session.classId;
                const studentsAllowedToVote = classInformation.classrooms[classId].poll.studentsAllowedToVote;
                const canVote = studentsAllowedToVote.includes(userId.toString());
                socket.emit('getCanVote', canVote);
            } catch (err) {
                logger.log('error', err.stack)
            }
        });

        /**
         * Changes the voting rights of a user or multiple users
         * @param {Object} votingData - An object containing the user ids and their voting rights.
         * This should only include ids which should be changed.
         */
        socket.on('changeCanVote', async (votingData) => {
            try {
                logger.log('info', `[changeCanVote] votingData=(${JSON.stringify(votingData)}) ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)

                const classId = socket.request.session.classId;
                const studentsAllowedToVote = classInformation.classrooms[classId].poll.studentsAllowedToVote;
                for (const userId in votingData) {
                    const votingRight = votingData[userId];
                    if (votingRight === true && studentsAllowedToVote.includes(userId) === false) {
                        // Add the email to the studentBoxes array if it's not already there
                        studentsAllowedToVote.push(userId);
                    } else {
                        // Remove all instances of the id from the studentBoxes array
                        studentsAllowedToVote.splice(0, studentsAllowedToVote.length, ...studentsAllowedToVote.filter(student => student !== userId));
                    }

                    // Emit the voting right to the user
                    const email = await getEmailFromId(userId);
                    emitToUser(email, 'getCanVote', votingRight);
                }
                socketUpdates.classUpdate(classId);
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
                        setClassOfApiSockets(api, user.activeClass);
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
                socketUpdates.classUpdate(classId)
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
                        socketUpdates.classUpdate();
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
        socket.on('classPermChange', async (userId, newPerm) => {
            try {
                const email = await getEmailFromId(userId);
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

                // Reload the user's page and update the class
                io.to(`user-${email}`).emit('reload')
                socketUpdates.classUpdate()
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
                        socketUpdates.classUpdate()
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