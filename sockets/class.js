const { classStateStore } = require("@services/classroom-service");
const { advancedEmitToClass, setClassOfApiSockets } = require("@services/socket-updates-service");
const {
    startClass,
    endClass,
    leaveClass,
    isClassActive,
    joinClass,
    classKickStudent,
    classKickStudents,
    updateClassSetting,
    regenerateClassCode,
    clearVotesFromExcludedStudents,
} = require("@services/class-service");
const { enrollInClass, unenrollFromClass, deleteClassroom, setClassroomBanStatus } = require("@services/class-membership-service");
const { getIdFromEmail } = require("@services/student-service");
const { handleSocketError } = require("@modules/socket-error-handler");
const { SCOPES } = require("@modules/permissions");
const { onSocketEvent, hasScope, hasClassScope } = require("@modules/socket-event-middleware");

module.exports = {
    run(socket, socketUpdates) {
        // Starts a classroom session
        onSocketEvent(socket, "startClass", hasClassScope(SCOPES.CLASS.SESSION.START), async (socketContext) => {
            const classId = await socketContext.resolveClassId();
            await startClass(classId);
        });

        // Ends a classroom session
        onSocketEvent(socket, "endClass", hasClassScope(SCOPES.CLASS.SESSION.END), async (socketContext) => {
            const classId = await socketContext.resolveClassId();
            await endClass(classId, socketContext.session);
        });

        // Join a classroom session
        socket.on("joinClass", async (classId) => {
            await joinClass(socket.request.session, classId);
        });

        // Enrolls in a classroom by code
        socket.on("joinRoom", async (classCode) => {
            try {
                await enrollInClass(socket.request.session, classCode);
            } catch (err) {
                handleSocketError(err, socket, "joinRoom", "There was a server error. Please try again");
            }
        });

        /**
         * Leaves the classroom session
         * The user is still associated with the class, but they're not active in it
         */
        socket.on("leaveClass", async () => {
            try {
                await leaveClass(socket.request.session, socket.request.session.classId);
            } catch (err) {
                handleSocketError(err, socket, "leaveClass", "There was a server error. Please try again");
            }
        });

        /**
         * Permanently unenrolls the user from the classroom.
         * The user is no longer associated with the class.
         */
        socket.on("leaveRoom", async () => {
            try {
                await unenrollFromClass(socket.request.session, socket.request.session.classId);
            } catch (err) {
                handleSocketError(err, socket, "leaveRoom", "There was a server error. Please try again");
            }
        });

        socket.on("getActiveClass", () => {
            try {
                const api = socket.request.session.api;
                if (!api) {
                    return;
                }

                for (const email in classStateStore.getAllUsers()) {
                    const user = classStateStore.getAllUsers()[email];
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
         * Sets a setting for the classroom
         * @param {string} setting - A string representing the setting to change.
         * @param {string} value - The value to set the setting to.
         */
        onSocketEvent(socket, "setClassSetting", hasClassScope(SCOPES.CLASS.SESSION.SETTINGS), async (socketContext, setting, value) => {
            try {
                const classId = await socketContext.resolveClassId();
                const classSettings =
                    setting && typeof setting === "object" && !Array.isArray(setting)
                        ? setting
                        : {
                            [setting]: value,
                        };

                await updateClassSetting(classId, classSettings);

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
        onSocketEvent(socket, "isClassActive", hasClassScope(SCOPES.CLASS.SESSION.SETTINGS), async (socketContext) => {
            try {
                const isActive = isClassActive(await socketContext.resolveClassId());
                socket.emit("isClassActive", isActive);
            } catch (err) {
                handleSocketError(err, socket, "isClassActive");
            }
        });

        // Regenerates the class code for the classroom in the teacher's session
        onSocketEvent(socket, "regenerateClassCode", hasClassScope(SCOPES.CLASS.SESSION.REGENERATE_CODE), async (socketContext) => {
            try {
                const classId = await socketContext.resolveClassId();

                await regenerateClassCode(classId);
                socket.emit("reload");
            } catch (err) {
                handleSocketError(err, socket, "regenerateClassCode");
            }
        });

        /**
         * Changes the class name
         * @param {string} name - The new name of the class.
         */
        onSocketEvent(socket, "changeClassName", hasClassScope(SCOPES.CLASS.SESSION.RENAME), async (socketContext, name) => {
            try {
                const classId = await socketContext.resolveClassId();
                await updateClassSetting(classId, { name });
                socket.emit("changeClassName", classStateStore.getClassroom(classId)?.className || name);
                socket.emit("message", "Class name updated.");
            } catch (err) {
                handleSocketError(err, socket, "changeClassName");
            }
        });

        /**
         * Deletes a classroom
         * @param {string} classId - The ID of the classroom to delete.
         */
        onSocketEvent(socket, "deleteClass", hasScope(SCOPES.GLOBAL.CLASS.DELETE), async (socketContext, classId) => {
            try {
                await deleteClassroom(classId);
                socketUpdates.getOwnedClasses(socketContext.session.email);
            } catch (err) {
                handleSocketError(err, socket, "deleteClass");
            }
        });

        /**
         * Kicks a user from the classroom
         * @param {string} email - The email of the user to kick.
         */
        onSocketEvent(socket, "classKickStudent", hasClassScope(SCOPES.CLASS.STUDENTS.KICK), async (socketContext, email) => {
            try {
                const classId = await socketContext.resolveClassId();
                const userId = await getIdFromEmail(email);
                await classKickStudent(userId, classId);
                advancedEmitToClass("leaveSound", classId, {});
            } catch (err) {
                handleSocketError(err, socket, "classKickStudent");
            }
        });

        /**
         * Removes a student from the current class session without removing them from the classroom roster.
         * The student will appear as offline on the teacher's page but can rejoin the session.
         * @param {number} userId - The ID of the user to remove from the session.
         */
        onSocketEvent(socket, "classRemoveFromSession", hasClassScope(SCOPES.CLASS.STUDENTS.KICK), async (socketContext, userId) => {
            try {
                const classId = await socketContext.resolveClassId();
                if (classId) await classKickStudent(userId, classId, { exitRoom: false, ban: false });
                socketUpdates.classUpdate(classId);
            } catch (err) {
                handleSocketError(err, socket, "classRemoveFromSession");
            }
        });

        // Removes all students from the class
        onSocketEvent(socket, "classKickStudents", hasClassScope(SCOPES.CLASS.STUDENTS.KICK), async (socketContext) => {
            try {
                const classId = await socketContext.resolveClassId();
                await classKickStudents(classId);

                socketUpdates.classUpdate(classId);
                advancedEmitToClass("kickStudentsSound", classId, { api: true });
            } catch (err) {
                handleSocketError(err, socket, "classKickStudents");
            }
        });

        /**
         * Bans a user from the classroom
         * @param {string} id - The ID of the user to ban.
         */
        onSocketEvent(socket, "classBanUser", hasClassScope(SCOPES.CLASS.STUDENTS.BAN), async (socketContext, id) => {
            try {
                const classId = await socketContext.resolveClassId();

                if (!classId) {
                    socket.emit("message", "You are not in a class");
                    return;
                }

                if (!id) {
                    socket.emit("message", "No user ID provided. (Please contact the programmer)");
                    return;
                }

                await setClassroomBanStatus(classId, id, true);
                socketUpdates.classBannedUsersUpdate();
                socketUpdates.classUpdate(classId);
                socket.emit("message", `Banned ${id}`);
            } catch (err) {
                handleSocketError(err, socket, "classBanUser", "There was a server error try again.");
            }
        });

        /**
         * Unbans a user from the classroom
         * @param {string} id - The ID of the user to unban.
         */
        onSocketEvent(socket, "classUnbanUser", hasClassScope(SCOPES.CLASS.STUDENTS.BAN), async (socketContext, id) => {
            try {
                const classId = await socketContext.resolveClassId();

                if (!classId) {
                    socket.emit("message", "You are not in a class");
                    return;
                }

                if (!id) {
                    socket.emit("message", "No user ID provided. (Please contact the programmer)");
                    return;
                }

                // Remove the Banned role — user reverts to Guest (implicit)
                await setClassroomBanStatus(classId, id, false);
                socketUpdates.classBannedUsersUpdate();
                socketUpdates.classUpdate(classId);
                socket.emit("message", `Unbanned ${id}`);
            } catch (err) {
                handleSocketError(err, socket, "classUnbanUser", "There was a server error try again.");
            }
        });

        onSocketEvent(socket, "updateExcludedRespondents", hasClassScope(SCOPES.CLASS.STUDENTS.READ), async (socketContext, respondants) => {
            try {
                const classId = await socketContext.resolveClassId();
                const classroom = classStateStore.getClassroom(classId);
                if (!Array.isArray(respondants)) return;

                // Contains the list of student IDs who should be excluded from the poll
                const excludedRespondents = [...respondants];

                // Also automatically exclude students who are offline, on break, or have excluded tag
                for (const studentEmail of Object.keys(classroom.students)) {
                    const student = classroom.students[studentEmail];
                    const studentId = student.id;

                    // If the student doesn't exist, is offline/excluded, or is on break, add them to excluded list
                    if ((!student || student.isOffline || student.onBreak) && !excludedRespondents.includes(studentId)) {
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
