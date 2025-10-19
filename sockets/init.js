const { SocketUpdates } = require("../modules/socketUpdates");
const { io } = require("../modules/webServer");
const fs = require("fs");
const userSocketUpdates = {}; // Stores the socket update events for users

// Initializes all the websocket routes
function initSocketRoutes() {
    io.on('connection', async (socket) => {
        const socketUpdates = new SocketUpdates(socket);
        if (socket.request.session.email) {
            userSocketUpdates[socket.request.session.email] = socketUpdates;
        }

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
    initSocketRoutes,
    userSocketUpdates
}