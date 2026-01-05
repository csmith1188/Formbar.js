const { classInformation } = require("@modules/class/classroom");
const { dbGet } = require("@modules/database");
const { logger } = require("@modules/logger");
const { GLOBAL_SOCKET_PERMISSIONS, CLASS_SOCKET_PERMISSIONS, CLASS_SOCKET_PERMISSION_MAPPER } = require("@modules/permissions");
const { PASSIVE_SOCKETS } = require("@modules/socketUpdates");
const { camelCaseToNormal } = require("@modules/util");

module.exports = {
    order: 30,
    async run(socket, socketUpdates) {
        // Permission check
        socket.use(async ([event, ...args], next) => {
            try {
                const email = socket.request.session.email;
                let userData = classInformation.users[email];

                // If the classId in the session is different from the user's active class, update it
                const classId = userData && userData.activeClass != null ? userData.activeClass : socket.request.session.classId;
                if (!socket.request.session.classId || socket.request.session.classid !== classId) {
                    socket.request.session.classId = classId;
                    socket.request.session.save();
                }

                logger.log("info", `[socket permission check] Event=(${event}), email=(${email}), ClassId=(${classId})`);
                if (!classInformation.classrooms[classId] && classId != null) {
                    logger.log("info", "[socket permission check] Class does not exist");
                    socket.emit("message", "Class does not exist");
                    return;
                }

                // If the class provided by the user is not loaded into memory, avoid going further to avoid errors
                if (CLASS_SOCKET_PERMISSION_MAPPER[event] && !classInformation.classrooms[classId]) {
                    logger.log("info", "[socket permission check] Class is not loaded");
                    socket.emit("message", "Class is not loaded");
                    return;
                }

                if (!classInformation.users[email]) {
                    // Get the user data from the database
                    userData = await dbGet("SELECT * FROM users WHERE email=?", [email]);
                    userData.classPermissions = await dbGet("SELECT permissions FROM classUsers WHERE studentId=? AND classId=?", [
                        userData.id,
                        classId,
                    ]);
                }

                if (GLOBAL_SOCKET_PERMISSIONS[event] && userData.permissions >= GLOBAL_SOCKET_PERMISSIONS[event]) {
                    logger.log("info", "[socket permission check] Global socket permission check passed");
                    next();
                } else if (CLASS_SOCKET_PERMISSIONS[event] && userData.classPermissions >= CLASS_SOCKET_PERMISSIONS[event]) {
                    logger.log("info", "[socket permission check] Class socket permission check passed");
                    next();
                } else if (
                    CLASS_SOCKET_PERMISSION_MAPPER[event] &&
                    classInformation.classrooms[classId].permissions[CLASS_SOCKET_PERMISSION_MAPPER[event]] &&
                    userData.classPermissions >= classInformation.classrooms[classId].permissions[CLASS_SOCKET_PERMISSION_MAPPER[event]]
                ) {
                    logger.log("info", "[socket permission check] Class socket permission settings check passed");
                    next();
                } else if (!PASSIVE_SOCKETS.includes(event)) {
                    logger.log("info", `[socket permission check] User does not have permission to use ${camelCaseToNormal(event)}`);
                    socket.emit("message", `You do not have permission to use ${camelCaseToNormal(event)}.`);
                }
            } catch (err) {
                logger.log("error", err.stack);
            }
        });
    },
};
