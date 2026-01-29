const { dbGetAll, dbGet, dbRun } = require("@modules/database");
const { logger } = require("@modules/logger");
const { setClassOfApiSockets } = require("@modules/socketUpdates");
const { classInformation, Classroom } = require("@modules/class/classroom");
const { MANAGER_PERMISSIONS, DEFAULT_CLASS_PERMISSIONS } = require("@modules/permissions");
const { getStudentsInClass } = require("@modules/student");
const { generateKey } = require("@modules/util");

async function isUserInClass(userId, classId) {
    const result = await dbGet("SELECT 1 FROM classusers WHERE studentId = ? AND classId = ?", [userId, classId]);
    return !!result;
}

function getUserJoinedClasses(userId) {
    return dbGetAll(
        "SELECT classroom.name, classroom.id, classusers.permissions FROM classroom JOIN classusers ON classroom.id = classusers.classId WHERE classusers.studentId = ?",
        [userId]
    );
}

function getClassLinks(classId) {
    return dbGetAll("SELECT name, url FROM links WHERE classId = ?", [classId]);
}

async function getClassCode(classId) {
    const result = await dbGet("SELECT key FROM classroom WHERE id = ?", [classId]);
    return result ? result.key : null;
}

async function getClassIdByCode(classCode) {
    const result = await dbGet("SELECT id FROM classroom WHERE key = ?", [classCode]);
    return result ? result.id : null;
}

/**
 * Validates a classroom name
 * @param {string} className - The classroom name to validate
 * @returns {{valid: boolean, error?: string}} Returns validation result with error message if invalid
 */
function validateClassroomName(className) {
    if (!className || typeof className !== "string") {
        return { valid: false, error: "Classroom name is required" };
    }

    const trimmedName = className.trim();

    // Regex validates: 3-30 chars, no consecutive spaces, allowed chars only
    const validPattern = /^(?!.*\s{2})[a-zA-Z0-9\s\-_.'()&,]{3,30}$/;

    if (!validPattern.test(trimmedName)) {
        if (trimmedName.length === 0) {
            return { valid: false, error: "Classroom name cannot be empty" };
        }
        if (trimmedName.length < 3) {
            return { valid: false, error: "Classroom name must be at least 3 characters long" };
        }
        if (trimmedName.length > 100) {
            return { valid: false, error: "Classroom name must be 100 characters or less" };
        }
        return {
            valid: false,
            error: "Classroom name contains invalid characters. Only letters, numbers, spaces, and common punctuation (- _ . ' ( ) & ,) are allowed",
        };
    }

    return { valid: true };
}

/**
 * Parses and normalizes class permissions from database row
 * @private
 * @param {Object} permissionsRow - The permissions row from the database
 * @returns {Object} Normalized permissions object with defaults applied
 */
function parseClassPermissions(permissionsRow) {
    const parsedPermissions = {};
    for (let permission of Object.keys(DEFAULT_CLASS_PERMISSIONS)) {
        parsedPermissions[permission] =
            permissionsRow && permissionsRow[permission] != null ? permissionsRow[permission] : DEFAULT_CLASS_PERMISSIONS[permission];
    }
    return parsedPermissions;
}

/**
 * Normalizes classroom data fetched from database
 * Parses JSON fields and normalizes tags and poll history
 * @param {Object} classroom - The classroom object from database
 * @returns {Object} The normalized classroom object (mutates in place)
 */
function normalizeClassroomData(classroom) {
    // Parse JSON fields
    classroom.sharedPolls = JSON.parse(classroom.sharedPolls);
    classroom.pollHistory = JSON.parse(classroom.pollHistory);

    // Normalize tags to array
    if (classroom.tags) {
        classroom.tags = classroom.tags.split(",");
    } else {
        classroom.tags = [];
    }

    if (Array.isArray(classroom.pollHistory)) {
        // Parse poll data within poll history
        for (let poll of classroom.pollHistory) {
            poll.data = JSON.parse(poll.data);
        }

        // Handle empty poll history
        if (classroom.pollHistory[0] && classroom.pollHistory[0].id == null) {
            classroom.pollHistory = null;
        }
    }

    return classroom;
}

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
        // Validate classroom name
        const validation = validateClassroomName(className);
        if (!validation.valid) {
            const error = new Error(validation.error);
            error.code = "INVALID_CLASSROOM_NAME";
            throw error;
        }

        const key = generateKey(4);

        // Add classroom to the database
        const insertResult = await dbRun("INSERT INTO classroom(name, owner, key, tags) VALUES(?, ?, ?, ?)", [className, ownerId, key, null]);

        // Use the ID of the newly created classroom returned by dbRun
        const classId = insertResult && typeof insertResult.lastID !== "undefined" ? insertResult.lastID : null;
        if (!classId) {
            throw new Error("Class was not created successfully");
        }

        const classroom = {
            id: classId,
            name: className,
            key: key,
            tags: null,
        };
        // Ensure class_permissions exists for the new class
        let permissions = await dbGet("SELECT * FROM class_permissions WHERE classId = ?", [classroom.id]);
        if (!permissions) {
            permissions = { ...DEFAULT_CLASS_PERMISSIONS };
            await dbRun("INSERT OR IGNORE INTO class_permissions (classId) VALUES (?)", [classroom.id]);
        }

        classroom.permissions = parseClassPermissions(permissions);
        await initializeClassroom({
            id: classroom.id,
            className: classroom.name,
            key: classroom.key,
            owner: ownerId,
            userEmail: ownerEmail,
            permissions: classroom.permissions,
            sharedPolls: [],
            pollHistory: [],
            tags: classroom.tags,
        });

        return {
            classId: classroom.id,
            key: classroom.key,
            className: classroom.name,
        };
    } catch (err) {
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
            "SELECT classroom.id, classroom.name, classroom.key, classroom.owner, classroom.tags (CASE WHEN class_polls.pollId IS NULL THEN json_array() ELSE json_group_array(DISTINCT class_polls.pollId) END) as sharedPolls, (SELECT json_group_array(json_object('id', poll_history.id, 'class', poll_history.class, 'data', poll_history.data, 'date', poll_history.date)) FROM poll_history WHERE poll_history.class = classroom.id ORDER BY poll_history.date) as pollHistory FROM classroom LEFT JOIN class_polls ON class_polls.classId = classroom.id WHERE classroom.id = ?",
            [classId]
        );

        if (!classroom) {
            const error = new Error("Class does not exist");
            error.code = "CLASS_NOT_FOUND";
            throw error;
        }

        // Ensure class_permissions exists and normalize permissions to include defaults
        let permissionsRow = await dbGet("SELECT * FROM class_permissions WHERE classId = ?", [classroom.id]);

        classroom.permissions = parseClassPermissions(permissionsRow);

        // Normalize classroom data (JSON parsing, tags, poll history)
        normalizeClassroomData(classroom);

        // Initialize the classroom in memory
        await initializeClassroom({
            id: classroom.id,
            className: classroom.name,
            key: classroom.key,
            owner: classroom.owner,
            userEmail: userEmail,
            permissions: classroom.permissions,
            sharedPolls: classroom.sharedPolls,
            pollHistory: classroom.pollHistory,
            tags: classroom.tags,
        });

        return {
            classId: classroom.id,
            key: classroom.key,
            className: classroom.name,
        };
    } catch (err) {
        throw err;
    }
}

/**
 * Initializes a classroom in memory and adds the user to it
 * @private
 * @param {Object} params - The initialization parameters
 * @param {number} params.id - The class ID
 * @param {string} params.className - The class name
 * @param {string} params.key - The class key
 * @param {number} params.owner - The owner's user ID
 * @param {string} params.userEmail - The email of the user to add to the class
 * @param {Object} params.permissions - The class permissions object
 * @param {Array} [params.sharedPolls=[]] - Array of shared poll IDs
 * @param {Array} [params.pollHistory=[]] - Array of poll history objects
 * @param {Array|string} params.tags - Class tags
 * @returns {Promise<void>}
 */
async function initializeClassroom({ id, className, key, owner, userEmail, permissions, sharedPolls = [], pollHistory = [], tags }) {
    try {
        // Get the user's session data
        const user = classInformation.users[userEmail];
        if (!user) {
            throw new Error(`User ${userEmail} not found in classInformation`);
        }

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
                await dbRun(`UPDATE class_permissions SET ? WHERE classId=?`, [permissions[permission], id]);
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
    } catch (err) {
        throw err;
    }
}

module.exports = {
    isUserInClass,
    getUserJoinedClasses,
    getClassCode,
    getClassLinks,
    getClassIdByCode,
    validateClassroomName,
    initializeClassroom,
    createClass,
    joinClassById,
    normalizeClassroomData,
};
