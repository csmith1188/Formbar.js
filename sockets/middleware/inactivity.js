const { logger } = require("../../modules/logger");
const INACTIVITY_LIMIT = 60 * 60 * 1000; // 60 minutes
const lastActivities = {};

module.exports = {
    order: 40,
    run(socket, socketUpdates) {
        // Inactivity timeout middleware
        socket.use(([event, ...args], next) => {
            try {
                // Check if this is an API socket as API sockets should not be tracked for inactivity
                let isApiSocket = false;
                for (const room of socket.rooms) {
                    if (room.startsWith("api-")) {
                        isApiSocket = true;
                        break;
                    }
                }

                // Only track activity for non-API sockets
                if (!isApiSocket) {
                    const email = socket.request.session.email;
                    if (email) {
                        if (!lastActivities[email]) {
                            lastActivities[email] = {};
                        }
                        lastActivities[email][socket.id] = { socket, time: Date.now() };
                    }
                }

                next();
            } catch (err) {
                logger.log("error", err.stack);
            }
        });
    },
    INACTIVITY_LIMIT,
    lastActivities,
};
