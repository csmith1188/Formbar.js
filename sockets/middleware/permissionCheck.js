const { classInformation, getClassIDFromCode } = require("../../modules/class")
const { logger } = require("../../modules/logger")
const { GLOBAL_SOCKET_PERMISSIONS, CLASS_SOCKET_PERMISSIONS, CLASS_SOCKET_PERMISSION_MAPPER } = require("../../modules/permissions")
const { PASSIVE_SOCKETS } = require("../../modules/socketUpdates")
const { camelCaseToNormal } = require("../../modules/util")

module.exports = {
    order: 20,
    async run(socket, socketUpdates) {
        // Permission check
        socket.use(async ([event, ...args], next) => {
            try {
                const username = socket.request.session.username;
                const classCode = socket.request.session.class;
                const classId = await getClassIDFromCode(classCode);

                logger.log('info', `[socket permission check] Event=(${event}), Username=(${username}), ClassCod=(${classCode})`)
                
                if (!classInformation.classrooms[classId] && classCode != "noClass") {
                    logger.log('info', '[socket permission check] Class does not exist')
                    socket.emit('message', 'Class does not exist')
                    return
                }

                if (!classInformation.users[username]) {
                    logger.log('info', '[socket permission check] User is not logged in')
                    socket.emit('message', 'User is not logged in')
                    return
                }

                if (GLOBAL_SOCKET_PERMISSIONS[event] && classInformation.users[username].permissions >= GLOBAL_SOCKET_PERMISSIONS[event]) {
                    logger.log('info', '[socket permission check] Global socket permission check passed')
                    next()
                } else if (CLASS_SOCKET_PERMISSIONS[event] && classInformation.users[username].classPermissions >= CLASS_SOCKET_PERMISSIONS[event]) {
                    logger.log('info', '[socket permission check] Class socket permission check passed')
                    next()
                } else if (
                    CLASS_SOCKET_PERMISSION_MAPPER[event] &&
                    classInformation.classrooms[classId].permissions[CLASS_SOCKET_PERMISSION_MAPPER[event]] &&
                    classInformation.users[username].classPermissions >= classInformation.classrooms[classId].permissions[CLASS_SOCKET_PERMISSION_MAPPER[event]]
                ) {
                    logger.log('info', '[socket permission check] Class socket permission settings check passed')
                    next()
                } else if (!PASSIVE_SOCKETS.includes(event)) {
                    logger.log('info', `[socket permission check] User does not have permission to use ${camelCaseToNormal(event)}`)
                    socket.emit('message', `You do not have permission to use ${camelCaseToNormal(event)}.`)
                }
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}