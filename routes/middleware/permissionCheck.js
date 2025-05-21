const { logger } = require("../../modules/logger");
const { CLASS_SOCKET_PERMISSION_MAPPER, GLOBAL_SOCKET_PERMISSIONS, CLASS_SOCKET_PERMISSIONS} = require("../../modules/permissions");
const { classInformation } = require("../../modules/class/classroom");
const { dbGet } = require("../../modules/database");
const { PASSIVE_SOCKETS } = require("../../modules/socketUpdates");
const { camelCaseToNormal } = require("../../modules/util");

/**
 * Permission check for HTTP requests
 * This is used for using the same socket permissions for socket APIs for HTTP APIs.
 * @param {string} event
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<boolean>}
 */
async function httpPermCheck(event, req, res) {
    try {
        const email = req.session.user.email;
        const classId = req.session.user.classId;

        if (!classInformation.classrooms[classId] && classId != null) {
            logger.log('info', [`[http permission check] Event=(${event}), email=(${email}), ClassId=(${classId})`]);
            res.status(401).json({ error: 'Class does not exist' });
            return false;
        }

        if (CLASS_SOCKET_PERMISSION_MAPPER[event] && !classInformation.classrooms[classId]) {
            logger.log('info', '[http permission check] Class is not loaded');
            res.status(401).json({ error: 'Class is not loaded' });
            return false;
        }

        let userData = classInformation.users[email];
        if (!classInformation.users[email]) {
            // Get the user data from the database
            userData = await dbGet('SELECT * FROM users WHERE email=?', [email]);
            userData.classPermissions = await dbGet('SELECT permissions FROM classUsers WHERE studentId=? AND classId=?', [userData.id, classId]);
        }

        if (GLOBAL_SOCKET_PERMISSIONS[event] && userData.permissions >= GLOBAL_SOCKET_PERMISSIONS[event]) {
            logger.log('info', '[socket permission check] Global socket permission check passed')
            return true;
        } else if (CLASS_SOCKET_PERMISSIONS[event] && userData.classPermissions >= CLASS_SOCKET_PERMISSIONS[event]) {
            logger.log('info', '[socket permission check] Class socket permission check passed')
            return true;
        } else if (
            CLASS_SOCKET_PERMISSION_MAPPER[event] &&
            classInformation.classrooms[classId].permissions[CLASS_SOCKET_PERMISSION_MAPPER[event]] &&
            userData.classPermissions >= classInformation.classrooms[classId].permissions[CLASS_SOCKET_PERMISSION_MAPPER[event]]
        ) {
            logger.log('info', '[socket permission check] Class socket permission settings check passed')
            return true;
        } else if (!PASSIVE_SOCKETS.includes(event)) {
            logger.log('info', `[socket permission check] User does not have permission to use ${camelCaseToNormal(event)}`)
            res.status(401).json({ error: `You do not have permission to use ${camelCaseToNormal(event)}.` });
            return false;
        }
    } catch (err) {
        logger.log('error', err.stack);
        res.status(500).json({ error: 'There was a server error try again.' });
    }
}

module.exports = { httpPermCheck };