const { logger } = require("../../modules/logger");
const { CLASS_SOCKET_PERMISSION_MAPPER, GLOBAL_SOCKET_PERMISSIONS, CLASS_SOCKET_PERMISSIONS, CLASS_PERMISSIONS} = require("../../modules/permissions");
const { classInformation } = require("../../modules/class/classroom");
const { dbGet } = require("../../modules/database");
const { PASSIVE_SOCKETS } = require("../../modules/socketUpdates");
const { camelCaseToNormal } = require("../../modules/util");
const { checkUserClassPermission } = require("../../modules/class/class");

// For users who do not have teacher/manager permissions, then they can only access these endpoints when it's
// only affecting themselves.
const endpointWhitelistMap = [
    'getOwnedClasses',
    'getActiveClass'
]

function classPermCheck(classPermission) {
    return async function(req, res, next) {
        try {
            const classId = req.params.id;
            const hasPermissions = await checkUserClassPermission(req.session.user.id, classId, classPermission);
            if (hasPermissions) {
                next()
            } else {
                res.status(403).json({ message: 'Unauthorized' });
            }
        } catch (err) {
            logger.log('error', err.stack);
            res.status(500).json({ error: 'There was a server error try again.' });
        }
    }
}

/**
 * Permission check for HTTP requests
 * This is used for using the same socket permissions for socket APIs for HTTP APIs.
 * @param {string} event
 * @returns {Promise<boolean>}
 */
function httpPermCheck(event){
    return async function (req, res, next) {
        try {
            // Allow digipogs endpoints without permission checks (public API)
            if (req.path && req.path.startsWith('/digipogs/')) {
                logger.log('info', `[http permission check] Skipping for public digipogs endpoint ${event}`)
                return next();
            }

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
                if (endpointWhitelistMap.includes(event)) {
                    const id = req.params.id;
                    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
                    if (user.id == id) {
                        logger.log('info', `[http permission check] Socket permissions check passed via whitelist for ${camelCaseToNormal(event)}`);
                        return next();
                    }
                }

                logger.log('info', `[http permission check] User does not have permission to use ${camelCaseToNormal(event)}`)
                return res.status(401).json({ error: `You do not have permission to use ${camelCaseToNormal(event)}.` });
            }

            return next();
        } catch (err) {
            logger.log('error', err.stack);
            res.status(500).json({ error: 'There was a server error try again.' });
        }
    }
}

module.exports = {
    classPermCheck,
    httpPermCheck
};