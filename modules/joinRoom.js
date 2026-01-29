const { logger } = require("./logger");
const { Classroom, classInformation } = require("./class/classroom");
const { dbGet, dbGetAll } = require("@modules/database");
const { BANNED_PERMISSIONS, TEACHER_PERMISSIONS } = require("./permissions");
const { database } = require("./database");
const { advancedEmitToClass, setClassOfApiSockets, userUpdateSocket } = require("./socketUpdates");

async function joinRoomByCode(code, sessionUser) {
    try {
        const email = sessionUser.email;

        // Find the id of the class from the database
        const classroomDb = await dbGet("SELECT * FROM classroom WHERE key=?", [code]);

        // Check to make sure there was a class with that code
        if (!classroomDb) {
            return "No class with that code";
        }

        if (classroomDb.tags) {
            classroomDb.tags = classroomDb.tags.split(",");
        } else {
            classroomDb.tags = [];
        }

        // Load the classroom into the classInformation object if it's not already loaded
        if (!classInformation.classrooms[classroomDb.id]) {
            classInformation.classrooms[classroomDb.id] = new Classroom(
                classroomDb.id,
                classroomDb.name,
                classroomDb.key,
                classroomDb.owner,
                classroomDb.permissions,
                classroomDb.sharedPolls,
                classroomDb.pollHistory,
                classroomDb.tags
            );
        }

        // Find the id of the user who is trying to join the class
        let user = await new Promise((resolve, reject) => {
            database.get("SELECT id FROM users WHERE email=?", [email], (err, user) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(user);
            });
        });

        if (!user && !classInformation.users[email]) {
            return "user is not in database";
        } else if (classInformation.users[email] && classInformation.users[email].isGuest) {
            user = classInformation.users[email];
        }

        // If the user is not a guest, then link them to the class
        let classUser;
        if (!user.isGuest) {
            // Add the two id's to the junction table to link the user and class
            classUser = await new Promise((resolve, reject) => {
                database.get("SELECT * FROM classusers WHERE classId=? AND studentId=?", [classroomDb.id, user.id], (err, classUser) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(classUser);
                });
            });
        }

        if (classUser) {
            // If the user is banned, then don't let them join
            if (classUser.permissions <= BANNED_PERMISSIONS) {
                return "You are banned from that class.";
            }

            // Get the student's session data ready to transport into new class
            let currentUser = classInformation.users[email];

            // Set class permissions and clear any previous tags so they don't persist across classes
            currentUser.classPermissions = classUser.permissions;
            currentUser.activeClass = classroomDb.id;

            // Load tags from classusers table
            currentUser.tags = classUser.tags ? classUser.tags.split(",").filter(Boolean) : [];
            currentUser.tags = currentUser.tags.filter((tag) => tag !== "Offline");
            classInformation.users[email].tags = currentUser.tags;

            // Add the student to the newly created class
            const classroom = classInformation.classrooms[classroomDb.id];
            classroom.students[email] = currentUser;

            // Set the active class of the user
            classInformation.users[email].activeClass = classroomDb.id;
            advancedEmitToClass("joinSound", classroomDb.id, {});

            // Set session class and classId
            sessionUser.classId = classroomDb.id;

            // Set the class of the API socket
            setClassOfApiSockets(currentUser.API, classroomDb.id);

            // Call classUpdate on all user's tabs
            userUpdateSocket(email, "classUpdate", classroomDb.id, { global: false, restrictToControlPanel: true });

            return true;
        } else {
            // If the user is not a guest, then insert them into the database
            if (!user.isGuest) {
                await new Promise((resolve, reject) => {
                    database.run(
                        "INSERT INTO classusers(classId, studentId, permissions) VALUES(?, ?, ?)",
                        [classroomDb.id, user.id, classInformation.classrooms[classroomDb.id].permissions.userDefaults],
                        (err) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            resolve();
                        }
                    );
                });

            }

            // Grab the user from the users list
            const classData = classInformation.classrooms[classroomDb.id];
            let currentUser = classInformation.users[email];
            currentUser.classPermissions = currentUser.id !== classData.owner ? classData.permissions.userDefaults : TEACHER_PERMISSIONS;
            currentUser.activeClass = classroomDb.id;
            currentUser.tags = [];

            // Add the student to the newly created class
            classData.students[email] = currentUser;

            classInformation.users[email].activeClass = classroomDb.id;
            const controlPanelPermissions = Math.min(
                classData.permissions.controlPoll,
                classData.permissions.manageStudents,
                classData.permissions.manageClass
            );

            setClassOfApiSockets(currentUser.API, classroomDb.id);

            // Call classUpdate on all user's tabs
            userUpdateSocket(email, "classUpdate", classroomDb.id, { global: false, restrictToControlPanel: true });

            return true;
        }
    } catch (err) {
        throw err;
    }
}

module.exports = {
    joinRoomByCode,
};
