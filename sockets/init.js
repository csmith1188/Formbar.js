const { SocketUpdates } = require("../modules/socketUpdates");
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
    })
}

module.exports = {
    initSocketRoutes
}