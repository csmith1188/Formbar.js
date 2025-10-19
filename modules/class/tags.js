const { classInformation } = require("./classroom");
const { dbRun } = require("../database");
const { logger } = require("../logger");
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
            .filter(tag => typeof tag === 'string')
            .map(tag => tag.trim())
            .filter(tag => tag !== '')
            .sort();
        if (!tags.includes('Offline')) tags.push('Offline');

        // If the class is loaded, update the class tags
        const classId = userSession.classId;
        if (!classId || !classInformation.classrooms[classId]) return;
        classInformation.classrooms[classId].tags = tags;

		for (const student of Object.values(classInformation.classrooms[classId].students)) {
            if (student.classPermissions == 0 || student.classPermissions >= 5) continue;
			if (!student.tags) student.tags = [];

			let studentTags = [];
            studentTags = student.tags.filter(Boolean);
            studentTags = studentTags.filter(tag => tags.includes(tag));
			student.tags = studentTags;

            try {
				await dbRun('UPDATE users SET tags = ? WHERE email = ?', [studentTags.join(','), student.email]);
            } catch (err) {
                logger.log('error', err.stack);
            }
        }

        // Persist classroom tags by id
        try {
            await dbRun('UPDATE classroom SET tags = ? WHERE id = ?', [tags.toString(), classId]);
        } catch (err) {
            logger.log('error', err.stack);
        }
    } catch (err) {
        logger.log('error', err.stack);
    }
}

async function saveTags(studentId, tags, userSession) {
    try {
        const email = await getEmailFromId(studentId);
        logger.log('info', `[saveTags] session=(${JSON.stringify(userSession)})`)
        logger.log('info', `[saveTags] studentId=(${studentId}) tags=(${JSON.stringify(tags)})`)
        if (!Array.isArray(tags)) return;

        // Remove blank/Offline for active students
        // ensure Offline for inactive students
        const isActiveInClass = classInformation.users[email] && classInformation.users[email].activeClass === userSession.classId;
        let normalized = tags
            .filter(tag => typeof tag === 'string')
            .map(tag => tag.trim())
            .filter(tag => tag !== '');

        if (isActiveInClass) {
            normalized = normalized.filter(tag => tag !== 'Offline');
        } else if (!normalized.includes('Offline')) {
            normalized.push('Offline');
        }

		// Store in memory (as array) and in the database (as comma-separated string for legacy column)
		classInformation.classrooms[userSession.classId].students[email].tags = normalized;
		await dbRun('UPDATE users SET tags = ? WHERE id = ?', [normalized.join(','), studentId]);
    } catch (err) {
        logger.log('error', err.stack)
    }
}

module.exports = {
    setTags,
    saveTags
}