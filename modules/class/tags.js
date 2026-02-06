const { classInformation } = require("./classroom");
const { dbRun } = require("../database");
const { logger } = require("../logger.js");
const { getEmailFromId } = require("../student");

/**
 * Sets the tags for the current class.
 * @param {string[]} tags - List of allowed class tags.
 * @param {object} userSession - The current user's session.
 */
async function setTags(tags, userSession) {
    try {
        if (!Array.isArray(tags)) return;

        // Normalize and ensure Offline exists
        tags = tags
            .filter((tag) => typeof tag === "string")
            .map((tag) => tag.trim())
            .map((tag) => tag.replace(/[\r\n\t]/g, "")) // Remove new lines, carriage returns, and tabs
            .filter((tag) => tag !== "")
            .sort();
        if (!tags.includes("Offline")) tags.push("Offline");

        // If the class is loaded, update the class tags
        const classId = userSession.classId;
        if (!classId || !classInformation.classrooms[classId]) return;
        classInformation.classrooms[classId].tags = tags;

        for (const student of Object.values(classInformation.classrooms[classId].students)) {
            if (student.classPermissions == 0 || student.classPermissions >= 5) continue;
            if (!student.tags) student.tags = [];

            let studentTags = [];
            studentTags = student.tags.filter(Boolean);
            studentTags = studentTags.filter((tag) => tags.includes(tag));
            student.tags = studentTags;

            try {
                await dbRun("UPDATE classusers SET tags = ? WHERE studentId = ? AND classId = ?", [studentTags.join(","), student.id, classId]);
            } catch (err) {
            }
        }

        // Persist classroom tags by id
        await dbRun("UPDATE classroom SET tags = ? WHERE id = ?", [tags.toString(), classId]);
    } catch (err) {
    }
}

async function saveTags(studentId, tags, userSession) {
    try {
        const email = await getEmailFromId(studentId);
        if (!Array.isArray(tags)) return;

        // Remove blank/Offline for active students
        // ensure Offline for inactive students
        const isActiveInClass = classInformation.users[email] && classInformation.users[email].activeClass === userSession.classId;
        let normalized = tags
            .filter((tag) => typeof tag === "string")
            .map((tag) => tag.trim())
            .map((tag) => tag.replace(/[\r\n\t]/g, "")) // Remove new lines, carriage returns, and tabs
            .filter((tag) => tag !== "");

        if (isActiveInClass) {
            normalized = normalized.filter((tag) => tag !== "Offline");
        } else if (!normalized.includes("Offline")) {
            normalized.push("Offline");
        }

        // Remove offline tag from normalized tags
        // The offline tag should not be stored in the database
        // After that, store tags in the student's session
        normalized = normalized.filter((tag) => tag !== "Offline");

        // Get student's current tags
        const student = classInformation.classrooms[userSession.classId].students[email];
        const oldTags = student.tags || [];

        // Update tags
        classInformation.classrooms[userSession.classId].students[email].tags = normalized;

        // If the "Excluded" tag was added, clear their poll response
        const wasExcluded = oldTags.includes("Excluded");
        const isNowExcluded = normalized.includes("Excluded");

        if (!wasExcluded && isNowExcluded && student.pollRes) {
            student.pollRes.buttonRes = "";
            student.pollRes.textRes = "";
            student.pollRes.date = null;
        }

        await dbRun("UPDATE classusers SET tags = ? WHERE studentId = ? AND classId = ?", [normalized.join(","), studentId, userSession.classId]);
    } catch (err) {
    }
}

module.exports = {
    setTags,
    saveTags,
};
