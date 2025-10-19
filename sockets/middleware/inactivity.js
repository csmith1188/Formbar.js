const { logger } = require("../../modules/logger")
const INACTIVITY_LIMIT = 60 * 60 * 1000; // 60 minutes
const lastActivities = {};

module.exports = {
    order: 40,
    run(socket, socketUpdates) {
        // Inactivity timeout middleware
        socket.use(([event, ...args], next) => {
            try {
                // Update the time of the last activity before proceeding
                const email = socket.request.session.email;
                if (!lastActivities[email]) {
                    lastActivities[email] = {};
                }

                lastActivities[email][socket.id] = {socket, time: Date.now()};
                next();
            } catch (err) {
                logger.log('error', err.stack)
            }
        });
    },
    INACTIVITY_LIMIT,
    lastActivities
}