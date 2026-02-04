const { logger } = require("@modules/logger");
const { Classroom, classInformation } = require("@modules/class/classroom");
const { dbGet } = require("@modules/database");
const { BANNED_PERMISSIONS, TEACHER_PERMISSIONS } = require("@modules/permissions");
const { database } = require("@modules/database");
const { advancedEmitToClass, setClassOfApiSockets, userUpdateSocket } = require("@modules/socket-updates");
const NotFoundError = require("@errors/not-found-error");
const ForbiddenError = require("@errors/forbidden-error");

/**
 * Allows a user to join a room using a room code.
 * Handles loading classroom data, validating user permissions, and updating session state.
 * @param {string} code - The room code to join
 * @param {Object} sessionUser - The user's session object containing email and other data
 * @returns {Promise<boolean>} Returns true if successful
 * @throws {NotFoundError} If no class exists with that code
 * @throws {ForbiddenError} If user is banned from the class
 */
async function joinRoomByCode(code, sessionUser) {
    const email = sessionUser.email;
    logger.log("info", `[joinRoomByCode] email=(${email}) roomCode=(${code})`);

    // Find the classroom from the database
    const classroomDb = await dbGet("SELECT * FROM classroom WHERE key=?", [code]);

    // Check to make sure there was a class with that code
    if (!classroomDb) {
        throw new NotFoundError("No class with that code");
    }

    // Parse tags
    classroomDb.tags = classroomDb.tags ? classroomDb.tags.split(",") : [];

    // Load the classroom into memory if it's not already loaded
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

    // Find the user who is trying to join the class
    let user = await dbGet("SELECT id FROM users WHERE email=?", [email]);

    if (!user && !classInformation.users[email]) {
        throw new NotFoundError("User is not in database");
    } else if (classInformation.users[email] && classInformation.users[email].isGuest) {
        user = classInformation.users[email];
    }

    // Get the class-user relationship if the user is not a guest
    let classUser;
    if (!user.isGuest) {
        classUser = await dbGet("SELECT * FROM classusers WHERE classId=? AND studentId=?", [classroomDb.id, user.id]);
    }

    if (classUser) {
        // If the user is banned, don't let them join
        if (classUser.permissions <= BANNED_PERMISSIONS) {
            throw new ForbiddenError("You are banned from that class");
        }

        // Get the student's session data
        let currentUser = classInformation.users[email];

        // Set class permissions and active class
        currentUser.classPermissions = classUser.permissions;
        currentUser.activeClass = classroomDb.id;

        // Load tags from classusers table
        currentUser.tags = classUser.tags ? classUser.tags.split(",").filter(Boolean) : [];
        currentUser.tags = currentUser.tags.filter((tag) => tag !== "Offline");
        classInformation.users[email].tags = currentUser.tags;

        // Add the student to the class
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

        logger.log("verbose", `[joinRoomByCode] User joined successfully`);
        return true;
    } else {
        // If the user is not a guest, insert them into the database
        if (!user.isGuest) {
            await database.run(
                "INSERT INTO classusers(classId, studentId, permissions) VALUES(?, ?, ?)",
                [classroomDb.id, user.id, classInformation.classrooms[classroomDb.id].permissions.userDefaults],
                (err) => {
                    if (err) {
                        throw err;
                    }
                }
            );

            logger.log("info", "[joinRoomByCode] Added user to classusers");
        }

        // Grab the user from the users list
        const classData = classInformation.classrooms[classroomDb.id];
        let currentUser = classInformation.users[email];
        currentUser.classPermissions = currentUser.id !== classData.owner ? classData.permissions.userDefaults : TEACHER_PERMISSIONS;
        currentUser.activeClass = classroomDb.id;
        currentUser.tags = [];

        // Add the student to the class
        classData.students[email] = currentUser;

        classInformation.users[email].activeClass = classroomDb.id;

        setClassOfApiSockets(currentUser.API, classroomDb.id);

        // Call classUpdate on all user's tabs
        userUpdateSocket(email, "classUpdate", classroomDb.id, { global: false, restrictToControlPanel: true });

        logger.log("verbose", `[joinRoomByCode] New user joined successfully`);
        return true;
    }
}

module.exports = {
    joinRoomByCode,
};
