// @TODO: Separate all of these into different routes

const { database } = require("../modules/database")
const { classInformation } = require("../modules/class")
const { logger } = require("../modules/logger")
const { SocketUpdates, advancedEmitToClass } = require("../modules/socketUpdates");
const { io } = require("../modules/webServer");
const fs = require("fs");

// Handles the websocket communications
function initSocketRoutes() {
    io.on('connection', async (socket) => {
        const socketUpdates = new SocketUpdates(socket);

        // Import middleware
        const socketMiddlewareFiles = fs.readdirSync("./sockets/middleware").filter(file => file.endsWith(".js"));
        const middlewares = socketMiddlewareFiles.map(file => require(`./middleware/${file}`));
        middlewares.sort((a, b) => a.order - b.order); // Sort the middleware functions by their order
        for (const middleware of middlewares) {
            middleware.run(socket, socketUpdates);
        }
        
        // Import socket routes
        const socketRouteFiles = fs.readdirSync('./sockets').filter(file => file.endsWith('.js'));
        for (const socketRouteFile of socketRouteFiles) {
            // Skip as this is the file initializing all of them
            if (socketRouteFile == "init.js") {
                continue;
            }

            const route = require(`./${socketRouteFile}`);
            route.run(socket, socketUpdates);
        }

        // Displays previous polls
        socket.on('previousPollDisplay', (pollIndex) => {
            try {
                logger.log('info', `[previousPollDisplay] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[previousPollDisplay] pollIndex=(${pollIndex})`)

                advancedEmitToClass(
                    'previousPollData',
                    socket.request.session.class,
                    { classPermissions: classInformation[socket.request.session.class].permissions.controlPolls },
                    classInformation[socket.request.session.class].pollHistory[pollIndex].data
                )
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('setClassPermissionSetting', (permission, level) => {
            try {
                logger.log('info', `[setClassPermissionSetting] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[setClassPermissionSetting] permission=(${permission}) level=(${level})`)

                let classCode = socket.request.session.class
                classInformation[classCode].permissions[permission] = level
                database.run('UPDATE classroom SET permissions=? WHERE id=?', [JSON.stringify(classInformation[classCode].permissions), classInformation[classCode].id], (err) => {
                    try {
                        if (err) throw err

                        logger.log('info', `[setClassPermissionSetting] ${permission} set to ${level}`)
                        socketUpdates.classPermissionUpdate()
                    } catch (err) {
                        logger.log('error', err.stack)
                    }
                })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    })
}

module.exports = {
    initSocketRoutes
}