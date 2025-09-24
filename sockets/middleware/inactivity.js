const { logger } = require("../../modules/logger")
const { userSocketUpdates } = require("../init");
const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30 minutes

module.exports = {
    order: 40,
    run(socket, socketUpdates) {
        let inactivityTimer;

        // Resets the inactivity timer
        function resetTimer() {
            clearTimeout(inactivityTimer);

            const socketUpdates = userSocketUpdates[socket.request.session.email];
            inactivityTimer = setTimeout(() => {
                socketUpdates.logout(socket);
            }, INACTIVITY_LIMIT);
        }

        // Inactivity timeout middleware
        socket.use(([event, ...args], next) => {
            try {
                resetTimer();
                next();
            } catch (err) {
                logger.log('error', err.stack)
            }
        });

        socket.on('disconnect', () => {
            clearTimeout(inactivityTimer);
        });
    }
}