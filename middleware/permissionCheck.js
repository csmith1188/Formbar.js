const { logger } = require("@modules/logger");
const { CLASS_SOCKET_PERMISSION_MAPPER, GLOBAL_SOCKET_PERMISSIONS, CLASS_SOCKET_PERMISSIONS } = require("@modules/permissions");
const { classInformation } = require("@modules/class/classroom");
const { dbGet } = require("@modules/database");
const { PASSIVE_SOCKETS } = require("@modules/socketUpdates");
const { camelCaseToNormal } = require("@modules/util");
const AuthError = require("@errors/auth-error");
const ForbiddenError = require("@errors/forbidden-error");

// For users who do not have teacher/manager permissions, then they can only access these endpoints when it's
// only affecting themselves.
const endpointWhitelistMap = ["getOwnedClasses", "getActiveClass"];

/**
 * Middleware to check if a user has the required global permission.
 * @param {string|number} permission - The required permission level for the user.
 * @returns {Function} Express middleware function.
 */
function hasPermission(permission) {
    return function (req, res, next) {
        const user = classInformation.users[req.session.email];
        if (!user) {
            throw new AuthError("User not found");
        }

        if (user.permissions >= permission) {
            next();
        } else {
            throw new ForbiddenError("You do not have permission to access this resource.");
        }
    };
}

/**
 * Middleware to check if a user has the required class permission.
 * @param {string|number} classPermission - The required permission level for the class.
 * @returns {Function} Express middleware function.
 */
function hasClassPermission(classPermission) {
    return async function (req, res, next) {
        const classId = req.params.id;
        const classroom = classInformation.classrooms[classId];

        // If classroom is active in memory, check from memory
        if (classroom) {
            const user = classroom.students[req.session.user.email];
            if (!user) {
                throw new AuthError("User not found in this class.");
            }

            // Retrieve the permission level from the classroom's permissions
            const requiredPermissionLevel = typeof classPermission === "string" ? classroom.permissions[classPermission] : classPermission;

            if (user.classPermissions >= requiredPermissionLevel) {
                next();
            } else {
                throw new ForbiddenError("Unauthorized");
            }
        } else {
            throw new ForbiddenError("This class is not currently active.");
        }
    };
}

/**
 * Permission check for HTTP requests
 * This is used for using the same socket permissions for socket APIs for HTTP APIs.
 * @param {string} event
 * @returns {Promise<boolean>}
 */
function httpPermCheck(event) {
    return async function (req, res, next) {
        // Allow digipogs endpoints without permission checks (public API)
        if (req.path && req.path.startsWith("/digipogs/")) {
            return next();
        }

        const email = req.session.user.email;
        const classId = req.session.user.classId;

        if (!classInformation.classrooms[classId] && classId != null) {
            throw new AuthError("Class does not exist");
        }

        if (CLASS_SOCKET_PERMISSION_MAPPER[event] && !classInformation.classrooms[classId]) {
            throw new AuthError("Class is not loaded");
        }

        let userData = classInformation.users[email];
        if (!userData) {
            // Get the user data from the database
            userData = await dbGet("SELECT * FROM users WHERE email=?", [email]);
            userData.classPermissions = await dbGet("SELECT permissions FROM classUsers WHERE studentId=? AND classId=?", [userData.id, classId]);
        }

        if (GLOBAL_SOCKET_PERMISSIONS[event] && userData.permissions >= GLOBAL_SOCKET_PERMISSIONS[event]) {
            return next();
        } else if (CLASS_SOCKET_PERMISSIONS[event] && userData.classPermissions >= CLASS_SOCKET_PERMISSIONS[event]) {
            return next();
        } else if (
            CLASS_SOCKET_PERMISSION_MAPPER[event] &&
            classInformation.classrooms[classId].permissions[CLASS_SOCKET_PERMISSION_MAPPER[event]] &&
            userData.classPermissions >= classInformation.classrooms[classId].permissions[CLASS_SOCKET_PERMISSION_MAPPER[event]]
        ) {
            return next();
        } else if (!PASSIVE_SOCKETS.includes(event)) {
            if (endpointWhitelistMap.includes(event)) {
                const id = req.params.id;
                const user = await dbGet("SELECT * FROM users WHERE email = ?", [email]);
                if (user.id == id) {
                    return next();
                }
            }

            throw new AuthError(`You do not have permission to use ${camelCaseToNormal(event)}.`);
        }

        return next();
    };
}
module.exports = {
    hasPermission,
    hasClassPermission,
    httpPermCheck,
};
