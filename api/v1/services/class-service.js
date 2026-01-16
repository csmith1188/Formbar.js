const { dbGetAll, dbGet } = require("@modules/database");

async function isUserInClass(userId, classId) {
    const result = await dbGet("SELECT 1 FROM classusers WHERE studentId = ? AND classId = ?", [userId, classId]);
    return !!result;
}

async function getUserJoinedClasses(userId) {
    return await dbGetAll(
        "SELECT classroom.name, classroom.id, classusers.permissions FROM classroom JOIN classusers ON classroom.id = classusers.classId WHERE classusers.studentId = ?",
        [userId]
    );
}

async function getClassLinks(classId) {
    return await dbGetAll("SELECT name, url FROM links WHERE classId = ?", [classId]);
}

async function getClassCode(classId) {
    const result = await dbGet("SELECT key FROM classroom WHERE id = ?", [classId]);
    return result ? result.key : null;
}

async function getClassIdByCode(classCode) {
    const result = await dbGet("SELECT id FROM classroom WHERE key = ?", [classCode]);
    return result ? result.id : null;
}

module.exports = {
    isUserInClass,
    getUserJoinedClasses,
    getClassCode,
    getClassLinks,
    getClassIdByCode,
};
