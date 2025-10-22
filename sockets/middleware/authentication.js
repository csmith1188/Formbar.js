const { database } = require("../../modules/database");
const { logger } = require("../../modules/logger");

module.exports = {
    order: 20,
    run(socket, socketUpdates) {
        // Authentication for users and plugins to connect to formbar websockets
        // The user must be logged in order to connect to websockets
        socket.use(([event, ...args], next) => {
            try {
                let { api } = socket.request.headers;

                logger.log(
                    "info",
                    `[socket authentication] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)}) api=(${api}) event=(${event})`
                );

                if (socket.request.session.email) {
                    next();
                } else if (api) {
                    database.get("SELECT id, email FROM users WHERE API = ?", [api], (err, userData) => {
                        try {
                            if (err) throw err;
                            if (!userData) {
                                logger.log("verbose", "[socket authentication] not a valid API Key");
                                next(new Error("Not a valid API key"));
                                return;
                            }

                            socket.request.session.api = api;
                            socket.request.session.userId = userData.id;
                            socket.request.session.email = userData.email;
                            socket.request.session.classId = null;

                            next();
                        } catch (err) {
                            logger.log("error", err.stack);
                        }
                    });
                } else if (event == "reload") {
                    next();
                } else {
                    logger.log("info", "[socket authentication] Missing email or api");
                    next(new Error("Missing API key"));
                }
            } catch (err) {
                logger.log("error", err.stack);
            }
        });
    },
};
