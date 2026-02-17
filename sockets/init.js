const { SocketUpdates } = require("@modules/socket-updates");
const { io } = require("@modules/web-server");
const fs = require("fs");

// Stores the socket update events for users (keyed by email, then socket.id)
const userSocketUpdates = new Map();

/**
 * Adds a socket update instance for a user
 * @param {string} email - User's email
 * @param {string} socketId - Socket ID
 * @param {SocketUpdates} socketUpdates - SocketUpdates instance
 */
function addUserSocketUpdate(email, socketId, socketUpdates) {
    if (!userSocketUpdates.has(email)) {
        userSocketUpdates.set(email, new Map());
    }
    userSocketUpdates.get(email).set(socketId, socketUpdates);
}

/**
 * Removes a socket update instance for a user and cleans up if no more sockets
 * @param {string} email - User's email
 * @param {string} socketId - Socket ID
 */
function removeUserSocketUpdate(email, socketId) {
    const userSockets = userSocketUpdates.get(email);
    if (userSockets) {
        userSockets.delete(socketId);
        if (userSockets.size === 0) {
            userSocketUpdates.delete(email);
        }
    }
}

// Initializes all the websocket routes
function initSocketRoutes() {
    io.on("connection", async (socket) => {
        const socketUpdates = new SocketUpdates(socket);

        // Import middleware
        const socketMiddlewareFiles = fs.readdirSync("./sockets/middleware").filter((file) => file.endsWith(".js"));
        const middlewares = socketMiddlewareFiles.map((file) => require(`./middleware/${file}`));
        middlewares.sort((a, b) => a.order - b.order); // Sort the middleware functions by their order
        for (const middleware of middlewares) {
            middleware.run(socket, socketUpdates);
        }

        const skippedFiles = ["init.js", "middleware", "tests"];
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
                } else if (file.endsWith(".js")) {
                    const route = require(fullPath);
                    route.run(socket, socketUpdates);
                }
            }
        };

        // Import socket routes
        loadSockets(".");
    });
}

module.exports = {
    initSocketRoutes,
    userSocketUpdates,
    addUserSocketUpdate,
    removeUserSocketUpdate,
};
