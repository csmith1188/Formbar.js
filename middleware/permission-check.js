const { getLogger, logEvent } = require("@modules/logger");
const { CLASS_SOCKET_PERMISSION_MAPPER, GLOBAL_SOCKET_PERMISSIONS, CLASS_SOCKET_PERMISSIONS } = require("@modules/permissions");
const { classInformation } = require("@modules/class/classroom");
const { dbGet } = require("@modules/database");
const { PASSIVE_SOCKETS } = require("@modules/socket-updates");
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
        if (!req.user || !req.user.email) {
            throw new AuthError("User not authenticated");
        }

        const user = classInformation.users[req.user.email];
        if (!user) {
            throw new AuthError("User not found", { event: "permission.check.failed", reason: "user_not_found" });
        }

        if (user.permissions >= permission) {
            next();
        } else {
            throw new ForbiddenError("You do not have permission to access this resource.", { event: "permission.check.failed", reason: "insufficient_permissions" });
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

        const email = req.user.email;
        if (!email) {
            throw new AuthError("User not authenticated");
        }

        // If classroom is active in memory, check from memory
        if (classroom) {
            const user = classroom.students[email];
            if (!user) {
                throw new AuthError("User not found in this class.", { event: "permission.check.failed", reason: "user_not_in_class" });
            }

            // Retrieve the permission level from the classroom's permissions
            const requiredPermissionLevel = typeof classPermission === "string" ? classroom.permissions[classPermission] : classPermission;

            if (user.classPermissions >= requiredPermissionLevel) {
                next();
            } else {
                throw new ForbiddenError("Unauthorized", { event: "permission.check.failed", reason: "insufficient_class_permissions" });
            }
        } else {
            throw new ForbiddenError("This class is not currently active.", { event: "permission.check.failed", reason: "class_not_active" });
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
        const logger = await getLogger();
        // Allow digipogs endpoints without permission checks (public API)
        if (req.path && req.path.startsWith("/digipogs/")) {
            return next();
        }

        const email = req.user.email;
        if (!email) {
            throw new AuthError("User not authenticated");
        }

        // Get classId from req.user (set by isAuthenticated middleware) or from classInformation
        const classId = req.user?.classId ?? req.user?.activeClass ?? classInformation.users[email]?.classId ?? null;

        if (!classInformation.classrooms[classId] && classId != null) {
            throw new AuthError("Class does not exist", { event: "permission.check.failed", reason: "class_not_exist" });
        }

        if (CLASS_SOCKET_PERMISSION_MAPPER[event] && !classInformation.classrooms[classId]) {
            throw new AuthError("Class is not loaded", { event: "permission.check.failed", reason: "class_not_loaded" });
        }

        if (CLASS_SOCKET_PERMISSIONS[event] && !classInformation.classrooms[classId]) {
            throw new AuthError("Class is not loaded");
        }

        let userData = classInformation.users[email];
        if (!userData) {
            // Get the user data from the database
            userData = await dbGet("SELECT * FROM users WHERE email=?", [email]);
            if (!userData) {
                throw new AuthError("User not found");
            }
            userData.classPermissions = await dbGet("SELECT permissions FROM classUsers WHERE studentId=? AND classId=?", [userData.id, classId]);
        }

        if (GLOBAL_SOCKET_PERMISSIONS[event] && userData.permissions >= GLOBAL_SOCKET_PERMISSIONS[event]) {
            return next();
        } else if (CLASS_SOCKET_PERMISSIONS[event] && userData.classPermissions >= CLASS_SOCKET_PERMISSIONS[event]) {
            return next();
        } else if (
            CLASS_SOCKET_PERMISSION_MAPPER[event] &&
            classInformation.classrooms[classId]?.permissions[CLASS_SOCKET_PERMISSION_MAPPER[event]] &&
            userData.classPermissions >= classInformation.classrooms[classId].permissions[CLASS_SOCKET_PERMISSION_MAPPER[event]]
        ) {
            return next();
        } else if (!PASSIVE_SOCKETS.includes(event)) {
            if (endpointWhitelistMap.includes(event)) {
                const id = req.params.id;
                const user = await dbGet("SELECT * FROM users WHERE email = ?", [email]);
                if (user && user.id == id) {
                    logEvent(logger, "info", "permission.whitelist.passed", "Permission check passed via whitelist", { event: camelCaseToNormal(event) });
                    return next();
                }
            }

            throw new AuthError(`You do not have permission to use ${camelCaseToNormal(event)}.`, { event: "permission.check.failed", reason: "insufficient_permissions" });
        }

        return next();
    };
}

module.exports = {
    hasPermission,
    hasClassPermission,
    httpPermCheck,
};
