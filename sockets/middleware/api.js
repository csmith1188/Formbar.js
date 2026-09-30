const { classStateStore } = require("@services/classroom-service");
const { database } = require("@modules/database");
const { createStudentFromUserData, getIdFromEmail } = require("@services/student-service");
const { getUserClass, getUserDataFromDb } = require("@services/user-service");
const { classKickStudent } = require("@services/class-service");
const { resolveAPIKey } = require("@services/api-key-service");
const { verifyToken } = require("@services/auth-service");
const { socketStateStore } = require("@stores/socket-state-store");
const { addUserSocketUpdate, removeUserSocketUpdate } = require("../init");

const { handleSocketError } = require("@modules/socket-error-handler");

const MEMBER_RECONNECT_GRACE_MS = 300000;
const GUEST_RECONNECT_GRACE_MS = 30000;

/**
 * Tracks per-user reconnect grace-period timer handles.
 * Keyed by email; cleared whenever the user reconnects so stale timers
 * cannot fire and kick a user who has already re-established a socket.
 */
const reconnectTimers = new Map();

/**
 * Ensures a Student instance exists in classStateStore for the given user.
 * Creates a new Student object if one doesn't already exist for the user's email.
 */
function ensureStudentExists(userData) {
    if (!classStateStore.getUser(userData.email)) {
        classStateStore.setUser(userData.email, createStudentFromUserData(userData, { isGuest: false }));
        return;
    }

    classStateStore.updateUser(userData.email, {
        id: userData.id,
        API: userData.API,
        displayName: userData.displayName,
        verified: userData.verified,
        role: userData.role,
        roles: userData.roles || { global: [], class: [] },
        permissions: userData.permissions,
    });
}

/**
 * Sets up socket session data for an authenticated user.
 */
function setupSocketSession(socket, userData, includeApi = false) {
    const activeClassId = getUserClass(userData.email) ?? null;
    if (includeApi) {
        socket.request.session.api = userData.API;
    }

    socket.request.session.userId = userData.id;
    socket.request.session.email = userData.email;
    socket.request.session.classId = activeClassId;
}

/**
 * Joins socket to appropriate rooms based on authentication type.
 */
function joinSocketRooms(socket, email, classId, isApiAuth = false) {
    // Always join the personal room so future setClassOfApiSockets / setClassOfUserSockets
    // calls can locate this socket even when no class is active yet.
    if (isApiAuth) {
        socket.join(`api-${socket.request.session.api}`);
    } else {
        socket.join(`user-${email}`);
    }

    if (classId) {
        socket.join(`class-${classId}`);
    }
}

/**
 * Tracks user socket connections in the global userSockets object.
 */
function trackUserSocket(email, socketId, socket) {
    socketStateStore.setUserSocket(email, socketId, socket);
}

/**
 * Sets up disconnect handler for socket with proper cleanup logic.
 */
function setupDisconnectHandler(socket, email, classId, isApiAuth = false) {
    socket.on("disconnect", async () => {
        removeUserSocketUpdate(email, socket.id);

        const userId = await getIdFromEmail(email);
        if (isApiAuth) {
            if (!socketStateStore.hasUserSockets(email)) {
                classKickStudent(userId, classId, { exitRoom: false, ban: false });
            }
        } else {
            const { emptyAfterRemoval } = socketStateStore.removeUserSocket(email, socket.id);
            if (emptyAfterRemoval) {
                const liveUser = classStateStore.getUser(email);
                const activeClassId = liveUser?.activeClass ?? classId;
                const reconnectGraceMs = liveUser?.isGuest ? GUEST_RECONNECT_GRACE_MS : MEMBER_RECONNECT_GRACE_MS;

                // Give the client a reconnect grace period before treating the
                // disconnect as a deliberate class leave. This prevents refreshes
                // from immediately dropping in-class guest sessions.
                const timer = setTimeout(async () => {
                    reconnectTimers.delete(email);
                    if (!socketStateStore.hasUserSockets(email)) {
                        if (activeClassId) classKickStudent(userId, activeClassId, { exitRoom: false, ban: false });
                    }
                }, reconnectGraceMs);
                reconnectTimers.set(email, timer);
            }
        }
    });
}

/**
 * Completes socket authentication setup by orchestrating all authentication steps.
 */
function finalizeAuthentication(socket, userData, socketUpdates, isApiAuth = false) {
    ensureStudentExists(userData);
    setupSocketSession(socket, userData, isApiAuth);

    const { email, classId } = socket.request.session;

    // Cancel any pending reconnect-kick timer so a reconnecting user isn't
    // evicted by a timer that was started during their previous disconnect.
    if (reconnectTimers.has(email)) {
        clearTimeout(reconnectTimers.get(email));
        reconnectTimers.delete(email);
    }

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
    // Exported for use in backwards-compat.js to authenticate sockets via legacy socket events
    finalizeAuthentication,
    async run(socket, socketUpdates) {
        try {
            const { api } = socket.request.headers;
            const authorizationHeader = socket.request.headers.authorization;
            const authorization = authorizationHeader ? authorizationHeader.replace(/Bearer\s+/i, "") : null;

            // Try API key authentication first
            if (api) {
                const apiKeyUser = await resolveAPIKey(api);
                if (!apiKeyUser) {
                    throw "Not a valid API key";
                }

                const userData = await getUserDataFromDb(apiKeyUser.id);
                finalizeAuthentication(socket, userData, socketUpdates, true);
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

                        if (decodedToken.isGuest) {
                            const user = classStateStore.getUser(email);
                            if (!user || !user.isGuest) {
                                throw "Guest session not found";
                            }
                            finalizeAuthentication(socket, user, socketUpdates, false);
                            resolve();
                            return;
                        }

                        database.get("SELECT id FROM users WHERE id = ?", [userId], async (err, row) => {
                            try {
                                if (err) throw err;

                                if (!row) {
                                    throw "User not found";
                                }

                                const userData = await getUserDataFromDb(row.id);
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
                    throw err;
                });
            } else if (socket.request.session.email) {
                // Fall back to session-based authentication
                // Retrieve class id from the user's activeClass if session.classId is not set
                const email = socket.request.session.email;
                const user = classStateStore.getUser(email);
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
                    socketStateStore.removeUserSocket(email, socket.id);
                });
            }
        } catch (err) {
            handleSocketError(err, socket, "api-middleware");
        }
    },
};
