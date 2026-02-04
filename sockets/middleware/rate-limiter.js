const { logger } = require("@modules/logger");
const { rateLimits, PASSIVE_SOCKETS } = require("@modules/socket-updates");
const { TEACHER_PERMISSIONS } = require("@modules/permissions");

module.exports = {
    order: 0,
    run(socket, socketUpdates) {
        // Rate limiter
        socket.use(([event, ...args], next) => {
            try {
                if (!socket.request.session || !socket.request.session.email) {
                    return;
                }

                const email = socket.request.session.email;
                const currentTime = Date.now();
                const timeFrame = 1000; // 1 Second
                const limit = socket.request.session.permissions >= TEACHER_PERMISSIONS ? 100 : 30;
                if (!rateLimits[email]) {
                    rateLimits[email] = {};
                }

                const userRequests = rateLimits[email];
                userRequests[event] = userRequests[event] || [];
                while (userRequests[event].length && currentTime - userRequests[event][0] > timeFrame) {
                    userRequests[event].shift();
                    userRequests["hasBeenMessaged"] = false;
                }

                if (userRequests[event].length >= limit) {
                    if (!userRequests["hasBeenMessaged"] && !PASSIVE_SOCKETS.includes(event)) {
                        socket.emit("message", `You are being rate limited. Please try again in ${timeFrame / 1000} seconds.`);
                    }
                    userRequests["hasBeenMessaged"] = true;
                } else {
                    userRequests[event].push(currentTime);
                    next();
                }
            } catch (err) {
                logger.log("error", err.stack);
            }
        });
    },
};
