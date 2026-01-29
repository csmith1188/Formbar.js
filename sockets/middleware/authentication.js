const { database } = require("@modules/database");
const { logger } = require("@modules/logger");
const { compare } = require("@modules/crypto");

module.exports = {
    order: 20,
    run(socket, socketUpdates) {
        // Authentication for users and plugins to connect to formbar websockets
        // The user must be logged in order to connect to websockets
        socket.use(([event, ...args], next) => {
            try {
                let { api } = socket.request.headers;

                if (socket.request.session.email) {
                    next();
                } else if (api) {
                    // Get all users and compare the API key hash
                    database.all("SELECT id, email, API FROM users", [], async (err, users) => {
                        try {
                            if (err) throw err;

                            // Compare the provided API key with each user's hashed API key
                            let matchedUser = null;
                            for (const user of users) {
                                if (user.API && (await compare(api, user.API))) {
                                    matchedUser = user;
                                    break;
                                }
                            }

                            if (!matchedUser) {
                                next(new Error("Not a valid API key"));
                                return;
                            }

                            socket.request.session.api = matchedUser.API;
                            socket.request.session.userId = matchedUser.id;
                            socket.request.session.email = matchedUser.email;
                            socket.request.session.classId = null;

                            next();
                        } catch (err) {
                        }
                    });
                } else if (event == "reload") {
                    next();
                } else {
                    next(new Error("Missing API key"));
                }
            } catch (err) {
            }
        });
    },
};
