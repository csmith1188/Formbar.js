const { classInformation } = require("@modules/class/classroom");
const { database } = require("@modules/database");
const { userSockets } = require("@modules/socket-updates");
const { Student } = require("@modules/student");
const { getUserClass } = require("@modules/user/user");
const { classKickStudent } = require("@modules/class/kick");
const { compare } = require("@modules/crypto");
const { verifyToken } = require("@services/auth-service");
const { addUserSocketUpdate, removeUserSocketUpdate } = require("../init");

const { handleSocketError } = require("@modules/socket-error-handler");

/**
 * Ensures a Student instance exists in classInformation for the given user.
 * Creates a new Student object if one doesn't already exist for the user's email.
 *
 * @param {Object} userData - The user data object from the database
 * @param {string} userData.email - User's email address
 * @param {number} userData.id - User's unique identifier
 * @param {number} userData.permissions - User's permission level
 * @param {string} userData.API - User's API key (hashed)
 * @param {string} [userData.tags] - Comma-separated list of user tags
 * @param {string} userData.displayName - User's display name
 */
function ensureStudentExists(userData) {
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
}

/**
 * Sets up socket session data for an authenticated user.
 * Populates the socket's session with user information and retrieves the user's active class.
 *
 * @param {Object} socket - The socket.io socket instance
 * @param {Object} userData - The user data object from the database
 * @param {string} userData.email - User's email address
 * @param {number} userData.id - User's unique identifier
 * @param {string} [userData.API] - User's API key (included if API authentication)
 * @param {boolean} [includeApi=false] - Whether to include API key in session (for API key auth)
 */
function setupSocketSession(socket, userData, includeApi = false) {
    if (includeApi) {
        socket.request.session.api = userData.API;
    }
    socket.request.session.userId = userData.id;
    socket.request.session.email = userData.email;
    socket.request.session.classId = getUserClass(userData.email);
}

/**
 * Joins socket to appropriate rooms based on authentication type.
 * API-authenticated sockets join api-{key} and class-{id} rooms.
 * JWT/session-authenticated sockets join user-{email} and class-{id} rooms.
 *
 * @param {Object} socket - The socket.io socket instance
 * @param {string} email - User's email address
 * @param {number|null} classId - The class ID to join, or null if not in a class
 * @param {boolean} [isApiAuth=false] - Whether this is API key authentication
 */
function joinSocketRooms(socket, email, classId, isApiAuth = false) {
    if (classId) {
        if (isApiAuth) {
            socket.join(`api-${socket.request.session.api}`);
        } else {
            socket.join(`user-${email}`);
        }
        socket.join(`class-${classId}`);
    }
}

/**
 * Tracks user socket connections in the global userSockets object.
 * Maintains a mapping of email -> socketId -> socket for managing multiple connections per user.
 *
 * @param {string} email - User's email address
 * @param {string} socketId - The socket's unique identifier
 * @param {Object} socket - The socket.io socket instance
 */
function trackUserSocket(email, socketId, socket) {
    if (!userSockets[email]) {
        userSockets[email] = {};
    }
    userSockets[email][socketId] = socket;
}

/**
 * Sets up disconnect handler for socket with proper cleanup logic.
 * Handles cleanup of socket updates and user tracking, and kicks user from class
 * when their last socket disconnects.
 *
 * @param {Object} socket - The socket.io socket instance
 * @param {string} email - User's email address
 * @param {number|null} classId - The class ID the user is in, or null
 * @param {boolean} [isApiAuth=false] - Whether this is API key authentication
 */
function setupDisconnectHandler(socket, email, classId, isApiAuth = false) {
    socket.on("disconnect", () => {
        removeUserSocketUpdate(email, socket.id);

        if (isApiAuth) {
            if (!userSockets[email]) {
                classKickStudent(email, classId, false);
            }
        } else {
            if (userSockets[email]) {
                delete userSockets[email][socket.id];
                if (Object.keys(userSockets[email]).length === 0) {
                    delete userSockets[email];
                    classKickStudent(email, classId, false);
                }
            }
        }
    });
}

/**
 * Completes socket authentication setup by orchestrating all authentication steps.
 * This function ensures the user exists, sets up their session, joins appropriate rooms,
 * tracks their socket connection, and sets up disconnect handling.
 *
 * @param {Object} socket - The socket.io socket instance
 * @param {Object} userData - The user data object from the database
 * @param {string} userData.email - User's email address
 * @param {number} userData.id - User's unique identifier
 * @param {number} userData.permissions - User's permission level
 * @param {string} userData.API - User's API key (hashed)
 * @param {string} [userData.tags] - Comma-separated list of user tags
 * @param {string} userData.displayName - User's display name
 * @param {Object} socketUpdates - The SocketUpdates instance for this connection
 * @param {boolean} [isApiAuth=false] - Whether this is API key authentication
 */
function finalizeAuthentication(socket, userData, socketUpdates, isApiAuth = false) {
    ensureStudentExists(userData);
    setupSocketSession(socket, userData, isApiAuth);

    const { email, classId } = socket.request.session;

    joinSocketRooms(socket, email, classId, isApiAuth);
    socket.emit("setClass", classId);

    if (!isApiAuth) {
        trackUserSocket(email, socket.id, socket);
    }

    addUserSocketUpdate(email, socket.id, socketUpdates);
    setupDisconnectHandler(socket, email, classId, isApiAuth);
}

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
                                throw "Not a valid API key";
                            }

                            finalizeAuthentication(socket, userData, socketUpdates, true);
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
                            throw "Invalid access token";
                        }

                        const email = decodedToken.email;
                        const userId = decodedToken.id;

                        if (!email || !userId) {
                            throw "Invalid access token: missing required fields";
                        }

                        // Fetch user data from database to get permissions, API key, and tags
                        database.get("SELECT * FROM users WHERE id = ?", [userId], (err, userData) => {
                            try {
                                if (err) throw err;

                                if (!userData) {
                                    throw "User not found";
                                }

                                finalizeAuthentication(socket, userData, socketUpdates, false);
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
                trackUserSocket(email, socket.id, socket);

                // Track SocketUpdates instance for this user
                addUserSocketUpdate(email, socket.id, socketUpdates);

                // Cleanup on disconnect
                socket.on("disconnect", () => {
                    removeUserSocketUpdate(email, socket.id);
                    if (userSockets[email]) {
                        delete userSockets[email][socket.id];
                        if (Object.keys(userSockets[email]).length === 0) {
                            delete userSockets[email];
                        }
                    }
                });
            }
        } catch (err) {
            handleSocketError(err, socket, "api-middleware");
        }
    },
};
