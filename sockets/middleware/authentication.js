const { database } = require("@modules/database");
const { compare } = require("@modules/crypto");
const { classInformation } = require("@modules/class/classroom");
const authService = require("@services/auth-service");

const { handleSocketError } = require("@modules/socket-error-handler");

module.exports = {
    order: 20,
    run(socket, socketUpdates) {
        // Authentication for users and plugins to connect to formbar websockets
        // The user must be logged in order to connect to websockets
        socket.use(([event, ...args], next) => {
            try {
                let { api, authorization } = socket.request.headers;

                if (socket.request.session.email) {
                    next();
                } else if (authorization) {
                    // Try to authenticate using access token (JWT)
                    const decodedToken = authService.verifyToken(authorization);
                    if (decodedToken.error) {
                        next(new Error("Invalid access token"));
                        return;
                    }

                    const email = decodedToken.email;
                    if (!email) {
                        next(new Error("Invalid access token - missing email"));
                        return;
                    }

                    const user = classInformation.users[email];
                    if (!user) {
                        next(new Error("User not found"));
                        return;
                    }

                    // Set session information from the access token
                    socket.request.session.email = email;
                    socket.request.session.userId = user.id;
                    socket.request.session.displayName = user.displayName;
                    socket.request.session.verified = user.verified;
                    socket.request.session.tags = user.tags;
                    socket.request.session.classId = user.activeClass || null;

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
                            handleSocketError(err, socket, "authentication:api");
                            next(err);
                        }
                    });
                } else if (event == "reload") {
                    next();
                } else {
                    next(new Error("Missing authentication credentials"));
                }
            } catch (err) {
                handleSocketError(err, socket, "authentication");
                next(err);
            }
        });
    },
};
