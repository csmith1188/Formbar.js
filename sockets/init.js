const { SocketUpdates } = require("../modules/socketUpdates");
const { io } = require("../modules/webServer");
const fs = require("fs");
const userSocketUpdates = {}; // Stores the socket update events for users (keyed by email, then socket.id)

// Initializes all the websocket routes
function initSocketRoutes() {
    io.on('connection', async (socket) => {
        const socketUpdates = new SocketUpdates(socket);
        if (socket.request.session.email) {
            const email = socket.request.session.email;
            // Store multiple socket updates per user, keyed by socket.id
            if (!userSocketUpdates[email]) {
                userSocketUpdates[email] = {};
            }
            userSocketUpdates[email][socket.id] = socketUpdates;

            // Cleanup on disconnect
            socket.on('disconnect', () => {
                if (userSocketUpdates[email] && userSocketUpdates[email][socket.id]) {
                    delete userSocketUpdates[email][socket.id];
                    if (Object.keys(userSocketUpdates[email]).length === 0) {
                        delete userSocketUpdates[email];
                    }
                }
            });
        }

        // Import middleware
        const socketMiddlewareFiles = fs.readdirSync("./sockets/middleware").filter(file => file.endsWith(".js"));
        const middlewares = socketMiddlewareFiles.map(file => require(`./middleware/${file}`));
        middlewares.sort((a, b) => a.order - b.order); // Sort the middleware functions by their order
        for (const middleware of middlewares) {
            middleware.run(socket, socketUpdates);
        }

        const skippedFiles = ['init.js', 'middleware', 'tests'];
        const loadSockets = (directory) => {
            // If the directory is marked to be skipped, skip it
            if (skippedFiles.includes(directory)) return;

            // Read all files in the directory
            // If a file is a directory, recursively call loadSockets on it
            // If a file is a .js file, require it and call its run function with (socket, socketUpdates)
            const files = fs.readdirSync(`./sockets/${directory}`);
            for (const file of files) {
                // If the file is in the skippedFiles array, skip it
                if (skippedFiles.includes(file)) continue;

                const fullPath = `${directory}/${file}`;
                if (fs.statSync(`./sockets/${fullPath}`).isDirectory()) {
                    loadSockets(fullPath);
                } else if (file.endsWith('.js')) {
                    const route = require(fullPath);
                    route.run(socket, socketUpdates);
                }
            }
        };
        
        // Import socket routes
        loadSockets('.')
    })
}

module.exports = {
    initSocketRoutes,
    userSocketUpdates
}