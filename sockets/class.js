const { classInformation } = require("@modules/class/classroom");
const { database, dbRun } = require("@modules/database");
const { advancedEmitToClass, setClassOfApiSockets } = require("@modules/socket-updates");
const { generateKey } = require("@modules/util");
const { io } = require("@modules/web-server");
const { startClass, endClass, leaveClass, isClassActive, joinClass } = require("@services/class-service");
const { joinRoom, leaveRoom } = require("@services/room-service");
const { getEmailFromId, getIdFromEmail } = require("@modules/student");
const { BANNED_PERMISSIONS } = require("@modules/permissions");
const { classKickStudents, classKickStudent } = require("@modules/class/kick");
const { handleSocketError } = require("@modules/socket-error-handler");

module.exports = {
    run(socket, socketUpdates) {
        // Starts a classroom session
        socket.on("startClass", () => {
            try {
                const email = socket.request.session.email;
                const classId = classInformation.users[email].activeClass;
                startClass(classId);
            } catch (err) {
                handleSocketError(err, socket, "startClass", "There was a server error. Please try again");
            }
        });

        // Ends a classroom session
        socket.on("endClass", () => {
            try {
                const email = socket.request.session.email;
                const classId = classInformation.users[email].activeClass;
                endClass(classId, socket.request.session);
            } catch (err) {
                handleSocketError(err, socket, "endClass", "There was a server error. Please try again");
            }
        });

        // Join a classroom session
        socket.on("joinClass", async (classId) => {
            await joinClass(socket.request.session, classId);
        });

        // Joins a classroom
        socket.on("joinRoom", async (classCode) => {
            joinRoom(socket.request.session, classCode);
        });

        /**
         * Leaves the classroom session
         * The user is still associated with the class, but they're not active in it
         */
        socket.on("leaveClass", () => {
            leaveClass(socket.request.session);
        });

        /**
         * Leaves the classroom entirely
         * The user is no longer associated with the class
         */
        socket.on("leaveRoom", async () => {
            await leaveRoom(socket.request.session);
        });

        socket.on("getActiveClass", () => {
            try {
                const api = socket.request.session.api;

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
                handleSocketError(err, socket, "getActiveClass");
            }
        });

        /**
         * Helper function to clear poll votes from excluded students
         * @param {string} classId - The class ID
         */
        function clearVotesFromExcludedStudents(classId) {
            const { GUEST_PERMISSIONS, MOD_PERMISSIONS, TEACHER_PERMISSIONS } = require("@modules/permissions");
            const classData = classInformation.classrooms[classId];
            if (!classData) return;

            // Get the list of excluded students using the same logic as sortStudentsInPoll
            const excludedEmails = [];

            for (const student of Object.values(classData.students)) {
                let shouldExclude = false;

                // Check if excluded by checkbox (excludedRespondents stores student IDs)
                if (classData.poll && classData.poll.excludedRespondents && classData.poll.excludedRespondents.includes(student.id)) {
                    shouldExclude = true;
                }

                // Check if they have the Excluded tag
                if (student.tags && student.tags.includes("Excluded")) {
                    shouldExclude = true;
                }

                // Check exclusion based on class settings for permission levels
                if (classData.settings && classData.settings.isExcluded) {
                    if (classData.settings.isExcluded.guests && student.permissions == GUEST_PERMISSIONS) {
                        shouldExclude = true;
                    }
                    if (classData.settings.isExcluded.mods && student.classPermissions == MOD_PERMISSIONS) {
                        shouldExclude = true;
                    }
                    if (classData.settings.isExcluded.teachers && student.classPermissions == TEACHER_PERMISSIONS) {
                        shouldExclude = true;
                    }
                }

                // Check if on break
                if (student.break === true) {
                    shouldExclude = true;
                }

                // Check if offline or is a teacher
                if ((student.tags && student.tags.includes("Offline")) || student.classPermissions >= TEACHER_PERMISSIONS) {
                    shouldExclude = true;
                }

                if (shouldExclude) {
                    excludedEmails.push(student.email);
                }
            }

            // Clear votes for all excluded students
            for (const email of excludedEmails) {
                const student = classData.students[email];
                if (student && student.pollRes) {
                    student.pollRes.buttonRes = "";
                    student.pollRes.textRes = "";
                    student.pollRes.date = null;
                }
            }
        }

        /**
         * Sets a setting for the classroom
         * @param {string} setting - A string representing the setting to change.
         * @param {string} value - The value to set the setting to.
         */
        socket.on("setClassSetting", async (setting, value) => {
            try {
                const classId = socket.request.session.classId;

                // Update the setting in the classInformation and in the database
                classInformation.classrooms[classId].settings[setting] = value;
                await dbRun("UPDATE classroom SET settings=? WHERE id=?", [JSON.stringify(classInformation.classrooms[classId].settings), classId]);

                // If the isExcluded setting changed, clear votes from newly excluded students
                if (setting === "isExcluded") {
                    clearVotesFromExcludedStudents(classId);
                }

                // Trigger a class update to sync all clients
                socketUpdates.classUpdate(classId);
            } catch (err) {
                handleSocketError(err, socket, "setClassSetting");
            }
        });

        /**
         * Checks if the class the user is currently in is active
         * Returns true or false on the same event
         */
        socket.on("isClassActive", () => {
            try {
                const isActive = isClassActive(socket.request.session.classId);
                socket.emit("isClassActive", isActive);
            } catch (err) {
                handleSocketError(err, socket, "isClassActive");
            }
        });

        // Regenerates the class code for the classroom in the teacher's session
        socket.on("regenerateClassCode", () => {
            try {
                // Generate a new class code
                const accessCode = generateKey(4);

                // Update the class code in the database
                database.run("UPDATE classroom SET key=? WHERE id=?", [accessCode, socket.request.session.classId], (err) => {
                    try {
                        if (err) throw err;

                        // Update the class code in the class information, session, then refresh the page
                        classInformation.classrooms[socket.request.session.classId].key = accessCode;
                        socket.emit("reload");
                    } catch (err) {
                        handleSocketError(err, socket, "regenerateClassCode:callback");
                    }
                });
            } catch (err) {
                handleSocketError(err, socket, "regenerateClassCode");
            }
        });

        /**
         * Changes the class name
         * @param {string} name - The new name of the class.
         */
        socket.on("changeClassName", (name) => {
            try {
                if (!name) {
                    socket.emit("message", "Class name cannot be empty.");
                    return;
                }

                // Update the class name in the database
                database.run("UPDATE classroom SET name=? WHERE id=?", [name, socket.request.session.classId], (err) => {
                    try {
                        if (err) throw err;

                        // Update the class name in the class information
                        classInformation.classrooms[socket.request.session.classId].className = name;
                        socket.emit("changeClassName", name);
                        socket.emit("message", "Class name updated.");
                    } catch (err) {
                        handleSocketError(err, socket, "changeClassName:callback", "There was a server error try again.");
                    }
                });
            } catch (err) {
                handleSocketError(err, socket, "changeClassName");
            }
        });

        /**
         * Deletes a classroom
         * @param {string} classId - The ID of the classroom to delete.
         */
        socket.on("deleteClass", (classId) => {
            try {
                database.get("SELECT * FROM classroom WHERE id=?", classId, (err, classroom) => {
                    try {
                        if (err) throw err;

                        if (classroom) {
                            if (classInformation.classrooms[classId]) {
                                socketUpdates.endClass(classroom.key, classroom.id);
                            }

                            database.run("DELETE FROM classroom WHERE id=?", classroom.id);
                            database.run("DELETE FROM classusers WHERE classId=?", classroom.id);
                            database.run("DELETE FROM poll_history WHERE class=?", classroom.id);
                        }

                        socketUpdates.getOwnedClasses(socket.request.session.email);
                    } catch (err) {
                        handleSocketError(err, socket, "deleteClass:callback");
                    }
                });
            } catch (err) {
                handleSocketError(err, socket, "deleteClass");
            }
        });

        /**
         * Kicks a user from the classroom
         * @param {string} email - The email of the user to kick.
         */
        socket.on("classKickStudent", (email) => {
            try {
                const classId = socket.request.session.classId;
                classKickStudent(email, classId);
                advancedEmitToClass("leaveSound", classId, {});
            } catch (err) {
                handleSocketError(err, socket, "classKickStudent");
            }
        });

        // Removes all students from the class
        socket.on("classKickStudents", () => {
            try {
                const classId = socket.request.session.classId;
                classKickStudents(classId);

                socketUpdates.classUpdate(classId);
                advancedEmitToClass("kickStudentsSound", classId, { api: true });
            } catch (err) {
                handleSocketError(err, socket, "classKickStudents");
            }
        });

        /**
         * Bans a user from the classroom
         * @param {string} email - The email of the user to ban.
         */
        socket.on("classBanUser", (email) => {
            try {
                let classId = socket.request.session.classId;

                if (!classId) {
                    socket.emit("message", "You are not in a class");
                    return;
                }

                if (!email) {
                    socket.emit("message", "No email provided. (Please contact the programmer)");
                    return;
                }

                database.run(
                    "UPDATE classusers SET permissions = 0 WHERE classId = ? AND studentId = (SELECT id FROM users WHERE email=?)",
                    [classId, email],
                    (err) => {
                        try {
                            if (err) throw err;

                            if (classInformation.classrooms[socket.request.session.classId].students[email]) {
                                classInformation.classrooms[socket.request.session.classId].students[email].classPermissions = 0;
                            }

                            classKickStudent(email, classId);
                            socketUpdates.classBannedUsersUpdate();
                            socketUpdates.classUpdate();
                            socket.emit("message", `Banned ${email}`);
                        } catch (err) {
                            handleSocketError(err, socket, "classBanUser:callback", "There was a server error try again.");
                        }
                    }
                );
            } catch (err) {
                handleSocketError(err, socket, "classBanUser", "There was a server error try again.");
            }
        });

        /**
         * Unbans a user from the classroom
         * @param {string} email - The email of the user to unban.
         */
        socket.on("classUnbanUser", (email) => {
            try {
                let classId = socket.request.session.classId;

                if (!classId) {
                    socket.emit("message", "You are not in a class");
                    return;
                }

                if (!email) {
                    socket.emit("message", "No email provided. (Please contact the programmer)");
                    return;
                }

                database.run(
                    "UPDATE classusers SET permissions = 1 WHERE classId = ? AND studentId = (SELECT id FROM users WHERE email=?)",
                    [classId, email],
                    (err) => {
                        try {
                            if (err) throw err;

                            if (classInformation.classrooms[classId].students[email]) {
                                classInformation.classrooms[classId].students[email].classPermissions = 1;
                            }

                            // After unbanning, remove the user from the class so they rejoin fresh next time
                            getIdFromEmail(email)
                                .then((userId) => {
                                    classKickStudent(userId, classId, { exitRoom: true, ban: false });
                                    socketUpdates.classUpdate();
                                })
                                .catch(() => {});

                            socketUpdates.classBannedUsersUpdate();
                            socket.emit("message", `Unbanned ${email}`);
                        } catch (err) {
                            handleSocketError(err, socket, "classUnbanUser:callback", "There was a server error try again.");
                        }
                    }
                );
            } catch (err) {
                handleSocketError(err, socket, "classUnbanUser", "There was a server error try again.");
            }
        });

        /**
         * Changes permission of user. Takes which user and the new permission level
         * @param {string} email - The email of the user to change permissions for.
         * @param {number} newPerm - The new permission level to set.
         */
        socket.on("classPermChange", async (userId, newPerm) => {
            try {
                const email = await getEmailFromId(userId);
                const classId = socket.request.session.classId;

                // Prevent changing the owner's permissions
                const classroom = classInformation.classrooms[classId];
                if (classroom.owner == userId) {
                    socket.emit("message", "You cannot change the permissions of the class owner.");
                    return;
                }

                const oldPerm = classInformation.classrooms[classId].students[email].classPermissions || BANNED_PERMISSIONS;

                // Update the permission in the classInformation and in the database
                classInformation.classrooms[classId].students[email].classPermissions = newPerm;
                classInformation.users[email].classPermissions = newPerm;
                await dbRun("UPDATE classusers SET permissions=? WHERE classId=? AND studentId=?", [
                    newPerm,
                    classInformation.classrooms[classId].id,
                    classInformation.classrooms[classId].students[email].id,
                ]);

                // If the new permission is BANNED_PERMISSIONS, kick the user from the class and ban them
                if (newPerm === BANNED_PERMISSIONS) {
                    classKickStudent(userId, classId, { exitRoom: true, ban: true });
                    advancedEmitToClass("leaveSound", classId, {});
                    socketUpdates.classUpdate();
                    return;
                }

                // If the student's previous permissions were banned and the new permissions are higher, then
                // kick them from the class to allow them to rejoin. Await to ensure UI reflects immediately.
                if (oldPerm === BANNED_PERMISSIONS && newPerm > BANNED_PERMISSIONS) {
                    await classKickStudent(userId, classId, { exitRoom: true, ban: false });
                    socketUpdates.classUpdate();
                    return;
                }

                // Reload the user's page and update the class
                io.to(`user-${email}`).emit("reload");
                socketUpdates.classUpdate();
            } catch (err) {
                handleSocketError(err, socket, "classPermChange");
            }
        });

        /**
         * Sets the permission settings for the classroom
         * @param {string} permission - The permission to set.
         * @param {number} level - The level to set the permission to.
         * This can be 1, 2, 3, 4, 5 with guest permissions being 1.
         */
        socket.on("setClassPermissionSetting", async (permission, level) => {
            try {
                const classId = socket.request.session.classId;
                classInformation.classrooms[classId].permissions[permission] = level;
                dbRun(`UPDATE class_permissions SET ${permission}=? WHERE classId=?`, [level, classId]).catch((err) => {
                    handleSocketError(err, socket, "setClassPermissionSetting:dbRun");
                });
                socketUpdates.classUpdate(classId);
            } catch (err) {
                handleSocketError(err, socket, "setClassPermissionSetting");
            }
        });

        socket.on("updateExcludedRespondents", (respondants) => {
            try {
                const classId = socket.request.session.classId;
                const classroom = classInformation.classrooms[classId];
                if (!Array.isArray(respondants)) return;

                // Contains the list of student IDs who should be excluded from the poll
                const excludedRespondents = [...respondants];

                // Also automatically exclude students who are offline, on break, or have excluded tag
                for (const studentEmail of Object.keys(classroom.students)) {
                    const student = classroom.students[studentEmail];
                    const studentId = student.id;

                    // If the student doesn't exist, is offline/excluded, or is on break, add them to excluded list
                    if (
                        (!student || (student.tags && (student.tags.includes("Offline") || student.tags.includes("Excluded"))) || student.onBreak) &&
                        !excludedRespondents.includes(studentId)
                    ) {
                        excludedRespondents.push(studentId);
                    }
                }

                // Update both excludedRespondent properties to keep them in sync
                classroom.poll.excludedRespondents = excludedRespondents;

                // Clear votes from newly excluded students
                clearVotesFromExcludedStudents(classId);

                socketUpdates.classUpdate(classId);
            } catch (err) {
                handleSocketError(err, socket, "updateExcludedRespondents");
            }
        });
    },
};
