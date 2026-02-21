const { logger } = require("../../modules/logger");
const INACTIVITY_LIMIT = 60 * 60 * 1000; // 60 minutes
const lastActivities = {};

module.exports = {
    order: 40,
    run(socket, socketUpdates) {
        // Seed the user into lastActivities on connection so that completely idle users
        // (who never send any socket events) are still tracked and timed out.
        try {
            const isApiSocket = [...socket.rooms].some((room) => room.startsWith("api-"));
            if (!isApiSocket) {
                const email = socket.request.session.email;
                if (email) {
                    if (!lastActivities[email]) {
                        lastActivities[email] = {};
                    }
                    lastActivities[email][socket.id] = { socket, time: Date.now() };
                }
            }
        } catch (err) {
            logger.log("error", err.stack);
        }

        // Clean up the entry when the socket disconnects so the interval never
        // tries to operate on a dead socket.
        socket.on("disconnect", () => {
            try {
                const email = socket.request.session.email;
                if (email && lastActivities[email]) {
                    delete lastActivities[email][socket.id];
                    if (Object.keys(lastActivities[email]).length === 0) {
                        delete lastActivities[email];
                    }
                }
            } catch (err) {
                logger.log("error", err.stack);
            }
        });

        // Inactivity timeout middleware – refresh the timestamp on every socket event
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
