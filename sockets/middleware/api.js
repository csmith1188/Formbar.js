const { classInformation } = require("../../modules/class/classroom");
const { database } = require("../../modules/database");
const { logger } = require("../../modules/logger");
const { userSockets } = require("../../modules/socketUpdates");
const { Student } = require("../../modules/student");
const { getUserClass } = require("../../modules/user/user");
const { classKickStudent } = require("../../modules/class/kick");
const { compare, hash } = require("../../modules/crypto");

module.exports = {
    order: 10,
    async run(socket, socketUpdates) {
        try {
            const { api } = socket.request.headers;
            if (api) {
                await new Promise((resolve, reject) => {
                    // Get all users and compare the API key hash
                    database.all("SELECT * FROM users", [], async (err, users) => {
                        try {
                            if (err) throw err;

                            // Compare the provided API key with each user's hashed API key
                            let userData = null;
                            for (const user of users) {
                                if (user.API && await compare(api, user.API)) {
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
            } else if (socket.request.session.email) {
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
