const { classInformation, Classroom } = require("@modules/class/classroom");
const { dbRun, dbGet } = require("@modules/database");
const { logger } = require("@modules/logger");
const { DEFAULT_CLASS_PERMISSIONS, MANAGER_PERMISSIONS } = require("@modules/permissions");
const { setClassOfApiSockets } = require("@modules/socketUpdates");
const { getStudentsInClass } = require("@modules/student");
const { generateKey } = require("@modules/util");

/**
 * Creates a new classroom with the given name and owner
 * @async
 * @param {string} className - The name of the class to create
 * @param {number} ownerId - The ID of the user creating the class
 * @param {string} ownerEmail - The email of the user creating the class
 * @returns {Promise<{classId: number, key: string, className: string}>} Returns an object with class details on success
 * @throws {Error} Throws an error if class creation fails
 */
async function createClass(className, ownerId, ownerEmail) {
    try {
        const key = generateKey(4);

        // Add classroom to the database
        await dbRun("INSERT INTO classroom(name, owner, key, tags) VALUES(?, ?, ?, ?)", [className, ownerId, key, null]);

        logger.log("verbose", "[createClass] Added classroom to database");

        // Retrieve the newly created classroom
        const classroom = await dbGet("SELECT id, name, key, tags FROM classroom WHERE name = ? AND owner = ?", [className, ownerId]);

        if (!classroom || !classroom.id) {
            throw new Error("Class was not created successfully");
        }

        // Ensure class_permissions exists for the new class
        let permissions = await dbGet("SELECT * FROM class_permissions WHERE classId = ?", [classroom.id]);
        if (!permissions) {
            permissions = { ...DEFAULT_CLASS_PERMISSIONS };
            await dbRun("INSERT INTO class_permissions (classId) VALUES (?)", [classroom.id]);
        }

        const parsedPermissions = {};
        for (let permission of Object.keys(DEFAULT_CLASS_PERMISSIONS)) {
            parsedPermissions[permission] = permissions[permission] || DEFAULT_CLASS_PERMISSIONS[permission];
        }

        classroom.permissions = parsedPermissions;
        await initializeClassroom(classroom.id, classroom.name, classroom.key, ownerId, ownerEmail, classroom.permissions, [], [], classroom.tags);

        return {
            classId: classroom.id,
            key: classroom.key,
            className: classroom.name,
        };
    } catch (err) {
        logger.log("error", `[createClass] ${err.stack}`);
        throw err;
    }
}

/**
 * Joins an existing classroom by its ID
 * @async
 * @param {number} classId - The ID of the class to join
 * @param {number} userId - The ID of the user joining the class
 * @param {string} userEmail - The email of the user joining the class
 * @returns {Promise<{classId: number, key: string, className: string}>} Returns an object with class details on success
 * @throws {Error} Throws an error if class join fails
 */
async function joinClassById(classId, userId, userEmail) {
    try {
        const classroom = await dbGet(
            "SELECT classroom.id, classroom.name, classroom.key, classroom.tags, (CASE WHEN class_polls.pollId IS NULL THEN json_array() ELSE json_group_array(DISTINCT class_polls.pollId) END) as sharedPolls, (SELECT json_group_array(json_object('id', poll_history.id, 'class', poll_history.class, 'data', poll_history.data, 'date', poll_history.date)) FROM poll_history WHERE poll_history.class = classroom.id ORDER BY poll_history.date) as pollHistory FROM classroom LEFT JOIN class_polls ON class_polls.classId = classroom.id WHERE classroom.id = ?",
            [classId]
        );

        if (!classroom) {
            const error = new Error("Class does not exist");
            error.code = "CLASS_NOT_FOUND";
            throw error;
        }

        // Ensure class_permissions exists and normalize permissions to include defaults
        let permissionsRow = await dbGet("SELECT * FROM class_permissions WHERE classId = ?", [classroom.id]);
        let parsedPermissions = {};
        for (let permission of Object.keys(DEFAULT_CLASS_PERMISSIONS)) {
            parsedPermissions[permission] = permissionsRow[permission] != null ? permissionsRow[permission] : DEFAULT_CLASS_PERMISSIONS[permission];
        }

        classroom.permissions = parsedPermissions;
        classroom.sharedPolls = JSON.parse(classroom.sharedPolls);
        classroom.pollHistory = JSON.parse(classroom.pollHistory);

        if (classroom.tags) {
            classroom.tags = classroom.tags.split(",");
        } else {
            classroom.tags = [];
        }

        for (let poll of classroom.pollHistory) {
            poll.data = JSON.parse(poll.data);
        }

        if (classroom.pollHistory[0] && classroom.pollHistory[0].id == null) {
            classroom.pollHistory = null;
        }

        // Initialize the classroom in memory
        await initializeClassroom(
            classroom.id,
            classroom.name,
            classroom.key,
            classroom.owner,
            userEmail,
            classroom.permissions,
            classroom.sharedPolls,
            classroom.pollHistory,
            classroom.tags
        );

        return {
            classId: classroom.id,
            key: classroom.key,
            className: classroom.name,
        };
    } catch (err) {
        logger.log("error", `[joinClassById] ${err.stack}`);
        throw err;
    }
}

/**
 * Initializes a classroom in memory and adds the user to it
 * @private
 * @param {number} id - The class ID
 * @param {string} className - The class name
 * @param {string} key - The class key
 * @param {number} owner - The owner's user ID
 * @param {string} userEmail - The email of the user to add to the class
 * @param {Object} permissions - The class permissions object
 * @param {Array} sharedPolls - Array of shared poll IDs
 * @param {Array} pollHistory - Array of poll history objects
 * @param {Array|string} tags - Class tags
 * @returns {Promise<void>}
 */
async function initializeClassroom(id, className, key, owner, userEmail, permissions, sharedPolls = [], pollHistory = [], tags) {
    try {
        // Get the user's session data
        const user = classInformation.users[userEmail];
        if (!user) {
            throw new Error(`User ${userEmail} not found in classInformation`);
        }

        logger.log("verbose", `[initializeClassroom] id=(${id}) name=(${className}) key=(${key}) sharedPolls=(${JSON.stringify(sharedPolls)})`);

        // Validate and normalize permissions
        if (Object.keys(permissions).sort().toString() !== Object.keys(DEFAULT_CLASS_PERMISSIONS).sort().toString()) {
            for (let permission of Object.keys(permissions)) {
                if (!DEFAULT_CLASS_PERMISSIONS[permission]) {
                    delete permissions[permission];
                }
            }

            for (let permission of Object.keys(permissions)) {
                if (typeof permissions[permission] != "number" || permissions[permission] < 1 || permissions[permission] > 5) {
                    permissions[permission] = DEFAULT_CLASS_PERMISSIONS[permission];
                }
                await dbRun(`UPDATE class_permissions SET ${permission}=? WHERE classId=?`, [permissions[permission], id]);
            }
        }

        // Create or update classroom in memory
        if (!classInformation.classrooms[id]) {
            classInformation.classrooms[id] = new Classroom(id, className, key, owner, permissions, sharedPolls, pollHistory, tags);
        } else {
            classInformation.classrooms[id].permissions = permissions;
            classInformation.classrooms[id].sharedPolls = sharedPolls;
            classInformation.classrooms[id].pollHistory = pollHistory;
            classInformation.classrooms[id].tags = tags;
        }

        // Add the user to the newly created/joined class
        classInformation.classrooms[id].students[userEmail] = user;
        classInformation.classrooms[id].students[userEmail].classPermissions = MANAGER_PERMISSIONS;
        classInformation.users[userEmail].activeClass = id;
        classInformation.users[userEmail].classPermissions = MANAGER_PERMISSIONS;

        // Get all students in the class and add them to the classroom
        const classStudents = await getStudentsInClass(id);
        for (const studentEmail in classStudents) {
            // If the student is the current user or already in the class, skip
            if (studentEmail === userEmail) continue;
            if (classInformation.classrooms[id].students[studentEmail]) continue;

            const student = classStudents[studentEmail];

            // Normalize student.tags to an array of strings
            if (!Array.isArray(student.tags)) {
                if (typeof student.tags === "string" && student.tags.trim() !== "") {
                    student.tags = student.tags
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean);
                } else {
                    student.tags = [];
                }
            }

            // Ensure 'Offline' is present exactly once at the front if the user
            // is not the creator of the class.
            if (studentEmail !== userEmail && !student.tags.includes("Offline")) {
                student.tags.unshift("Offline");
            }

            student.displayName = student.displayName || student.email;
            classInformation.users[studentEmail] = student;
            classInformation.classrooms[id].students[studentEmail] = student;
        }

        // Set the class for all API sockets
        await setClassOfApiSockets(user.API, id);

        logger.log("verbose", `[initializeClassroom] Successfully initialized class ${id} for user ${userEmail}`);
    } catch (err) {
        logger.log("error", `[initializeClassroom] ${err.stack}`);
        throw err;
    }
}

module.exports = {
    createClass,
    joinClassById,
};
