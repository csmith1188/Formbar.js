const { dbGetAll } = require("@modules/database");

async function isUserInClass(userId, classId) {
    const result = await dbGetAll("SELECT 1 FROM classusers WHERE userId = ? AND classId = ?", [userId, classId]);
    return result.length > 0;
}

async function getUserJoinedClasses(userId) {
    const classes = await dbGetAll(
        "SELECT classroom.name, classroom.id, classusers.permissions FROM classroom JOIN classusers ON classroom.id = classusers.classId WHERE classusers.studentId = ?",
        [userId]
    );
    return classes;
}

async function getClassLinks(classId) {
    const links = await dbGetAll("SELECT name, url FROM links WHERE classId = ?", [classId]);
    return links;
}

async function getClassCode(classId) {
    const result = await dbGetAll("SELECT key FROM classroom WHERE id = ?", [classId]);
    if (result.length > 0) {
        return result[0].key;
    }
    return null;
}

async function getClassIdByCode(classCode) {
    const result = await dbGetAll("SELECT id FROM classroom WHERE key = ?", [classCode]);
    if (result.length > 0) {
        return result[0].id;
    }
    return null;
}

module.exports = {
    isUserInClass,
    getUserJoinedClasses,
    getClassCode,
    getClassLinks,
    getClassIdByCode
}