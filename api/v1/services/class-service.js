const { dbGetAll } = require("@modules/database");

async function isUserInClass(userId, classId) {
    const result = await dbGetAll("SELECT 1 FROM class_members WHERE userId = ? AND classId = ?", [userId, classId]);
    return result.length > 0;
}

async function getLinks(classId) {
    const links = await dbGetAll("SELECT name, url FROM links WHERE classId = ?", [classId]);
    return links;
}

module.exports = {
    isUserInClass,
    getLinks
}