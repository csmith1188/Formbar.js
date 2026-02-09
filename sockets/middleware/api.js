const { classInformation } = require("@modules/class/classroom");
const { database } = require("@modules/database");
const { logger } = require("@modules/logger");
const { userSockets } = require("@modules/socket-updates");
const { Student } = require("@modules/student");
const { getUserClass } = require("@modules/user/user");
const { classKickStudent } = require("@modules/class/kick");
const { compare } = require("@modules/crypto");
const { verifyToken } = require("@services/auth-service");

module.exports = {
    order: 10,
    async run(socket, socketUpdates) {
        try {
            const { api, authorization } = socket.request.headers;

            // Try API key authentication first
            if (api) {
                await new Promise((resolve, reject) => {
                    // Look up the user by comparing API key hash
                    database.all("SELECT * FROM users", [], async (err, users) => {
                        try {
                            if (err) throw err;

                            // Compare the provided API key with each user's hashed API key
                            let userData = null;
                            for (const user of users) {
                                if (user.API && (await compare(api, user.API))) {
                                    userData = user;
                                    break;
                                }
                            }

                            if (!userData) {
                                logger.log("verbose", "[socket authentication] not a valid API Key");
                                throw "Not a valid API key";
                            }

                            if (!classInformation.users[userData.email]) {
                                classInformation.users[userData.email] = new Student(
                                    userData.email,
                                    userData.id,
                                    userData.permissions,
                                    userData.API,
                                    null,
                                    null,
                                    userData.tags ? userData.tags.split(",") : [],
                                    userData.displayName,
                                    false
                                );
                            }

                            socket.request.session.api = userData.API;
                            socket.request.session.userId = userData.id;
                            socket.request.session.email = userData.email;
                            socket.request.session.classId = getUserClass(userData.email);

                            socket.join(`api-${userData.API}`);
                            socket.join(`class-${socket.request.session.classId}`);
                            socket.emit("setClass", socket.request.session.classId);
                            socket.on("disconnect", () => {
                                if (!userSockets[socket.request.session.email]) {
                                    classKickStudent(socket.request.session.email, socket.request.session.classId, false);
                                }
                            });

                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    });
                }).catch((err) => {
                    if (err instanceof Error) {
                        throw err;
                    }
                });
            } else if (authorization) {
                // Try JWT access token authentication
                await new Promise((resolve, reject) => {
                    try {
                        // Verify the JWT access token
                        const decodedToken = verifyToken(authorization);
                        if (decodedToken.error) {
                            logger.log("verbose", "[socket authentication] invalid access token");
                            throw "Invalid access token";
                        }

                        const email = decodedToken.email;
                        const userId = decodedToken.id;

                        if (!email || !userId) {
                            logger.log("verbose", "[socket authentication] access token missing required fields");
                            throw "Invalid access token: missing required fields";
                        }

                        // Fetch user data from database to get permissions, API key, and tags
                        database.get("SELECT * FROM users WHERE id = ?", [userId], (err, userData) => {
                            try {
                                if (err) throw err;

                                if (!userData) {
                                    logger.log("verbose", "[socket authentication] user not found for access token");
                                    throw "User not found";
                                }

                                if (!classInformation.users[userData.email]) {
                                    classInformation.users[userData.email] = new Student(
                                        userData.email,
                                        userData.id,
                                        userData.permissions,
                                        userData.API,
                                        null,
                                        null,
                                        userData.tags ? userData.tags.split(",") : [],
                                        userData.displayName,
                                        false
                                    );
                                }

                                socket.request.session.userId = userData.id;
                                socket.request.session.email = userData.email;
                                socket.request.session.classId = getUserClass(userData.email);

                                socket.join(`user-${userData.email}`);
                                socket.join(`class-${socket.request.session.classId}`);
                                socket.emit("setClass", socket.request.session.classId);

                                // Track all sockets for the user
                                if (!userSockets[userData.email]) userSockets[userData.email] = {};
                                userSockets[userData.email][socket.id] = socket;

                                socket.on("disconnect", () => {
                                    if (userSockets[userData.email]) {
                                        delete userSockets[userData.email][socket.id];
                                        if (Object.keys(userSockets[userData.email]).length === 0) {
                                            delete userSockets[userData.email];
                                            classKickStudent(userData.email, socket.request.session.classId, false);
                                        }
                                    }
                                });

                                resolve();
                            } catch (err) {
                                reject(err);
                            }
                        });
                    } catch (err) {
                        reject(err);
                    }
                }).catch((err) => {
                    if (err instanceof Error) {
                        throw err;
                    }
                });
            }
            // Fall back to session-based authentication
            else if (socket.request.session.email) {
                // Retrieve class id from the user's activeClass if session.classId is not set
                const email = socket.request.session.email;
                const user = classInformation.users[email];
                const classId = user && user.activeClass != null ? user.activeClass : socket.request.session.classId;
                if (classId) {
                    socket.request.session.classId = classId;
                    socket.request.session.save();
                    socket.join(`class-${classId}`);
                }

                // Track all sockets for the user
                socket.join(`user-${email}`);
                if (!userSockets[email]) userSockets[email] = {};
                userSockets[email][socket.id] = socket;

                // Cleanup on disconnect
                socket.on("disconnect", () => {
                    if (userSockets[email]) {
                        delete userSockets[email][socket.id];
                        if (Object.keys(userSockets[email]).length === 0) {
                            delete userSockets[email];
                        }
                    }
                });
            }
        } catch (err) {
            logger.log("error", err.stack);
        }
    },
};
