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
function httpPermCheck(event){
    return async function (req, res, next) {
        try {
            const email = req.session.user.email;
            const classId = req.session.user.classId;

            if (!classInformation.classrooms[classId] && classId != null) {
                logger.log('info', [`[http permission check] Event=(${event}), email=(${email}), ClassId=(${classId})`]);
                return res.status(401).json({ error: 'Class does not exist' });
            }

            if (CLASS_SOCKET_PERMISSION_MAPPER[event] && !classInformation.classrooms[classId]) {
                logger.log('info', '[http permission check] Class is not loaded');
                return res.status(401).json({ error: 'Class is not loaded' });
            }

            let userData = classInformation.users[email];
            if (!userData) {
                // Get the user data from the database
                userData = await dbGet('SELECT * FROM users WHERE email=?', [email]);
                userData.classPermissions = await dbGet('SELECT permissions FROM classUsers WHERE studentId=? AND classId=?', [userData.id, classId]);
            }

            if (GLOBAL_SOCKET_PERMISSIONS[event] && userData.permissions >= GLOBAL_SOCKET_PERMISSIONS[event]) {
                logger.log('info', '[http permission check] Global socket permission check passed')
                return next();
            } else if (CLASS_SOCKET_PERMISSIONS[event] && userData.classPermissions >= CLASS_SOCKET_PERMISSIONS[event]) {
                logger.log('info', '[http permission check] Class socket permission check passed')
                return next();
            } else if (
                CLASS_SOCKET_PERMISSION_MAPPER[event] &&
                classInformation.classrooms[classId].permissions[CLASS_SOCKET_PERMISSION_MAPPER[event]] &&
                userData.classPermissions >= classInformation.classrooms[classId].permissions[CLASS_SOCKET_PERMISSION_MAPPER[event]]
            ) {
                logger.log('info', '[http permission check] Class socket permission settings check passed')
                return next();
            } else if (!PASSIVE_SOCKETS.includes(event)) {
                logger.log('info', `[http permission check] User does not have permission to use ${camelCaseToNormal(event)}`)
                return res.status(401).json({ error: `You do not have permission to use ${camelCaseToNormal(event)}.` });
            }
        } catch (err) {
            logger.log('error', err.stack);
            res.status(500).json({ error: 'There was a server error try again.' });
        }
    }
}

function checkUserPermission(allowedPermission) {
    return function (req, res, next) {
        const email = req.session.user.email;
        const user = classInformation.users[email];
        if (!user) {
            return res.status(401).json({ error: 'Not logged in' });
        }

        if (user.permissions >= allowedPermission) {
            next()
        } else {
            return res.status(401).json({ error: "You don't have high enough permissions to access this endpoint." });
        }
    }
}

module.exports = {
    httpPermCheck,
    checkUserPermission
};