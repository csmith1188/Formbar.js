const handlebars = require("handlebars");
const fs = require("fs");
const crypto = require("crypto");
const AppError = require("@errors/app-error");
const NotFoundError = require("@errors/not-found-error");
const { sendMail } = require("@modules/mail");
const { dbGet, dbRun, dbGetAll, database } = require("@modules/database");
const { frontendUrl } = require("@modules/config");
const { classStateStore } = require("@services/classroom-service");
const { socketStateStore } = require("@stores/socket-state-store");
const { getUserScopes, getUserRoleName } = require("@modules/scope-resolver");
const { getUserRoles } = require("@services/role-service");
const { computeGlobalPermissionLevel, computeClassPermissionLevel, filterScopesByDomain, GUEST_PERMISSIONS } = require("@modules/permissions");
const { handleSocketError } = require("@modules/socket-error-handler");
const { managerUpdate, userUpdateSocket } = require("@services/socket-updates-service");
const { endClass } = require("@services/class-service");
const { deleteClassrooms } = require("@services/class-service");
const { deleteCustomPolls } = require("@services/poll-service");
const { hashBcrypt, compareBcrypt, sha256 } = require("@modules/crypto");
const { requireInternalParam } = require("@modules/error-wrapper");
const { assertValidPassword } = require("@modules/password-validation");
const { getEmailFromId } = require("@services/student-service");
const { error } = require("console");

let passwordResetTemplate;
let verifyEmailTemplate;
let pinResetTemplate;
let poolPinResetTemplate;

const TOKEN_PURPOSES = {
    PASSWORD_RESET: "password_reset",
    PIN_RESET: "pin_reset",
    EMAIL_VERIFY: "email_verify",
    POOL_PIN_RESET: "pool_pin_reset"
};

const TOKEN_TTL_SECONDS = {
    [TOKEN_PURPOSES.PASSWORD_RESET]: 60 * 60,
    [TOKEN_PURPOSES.PIN_RESET]: 60 * 60,
    [TOKEN_PURPOSES.EMAIL_VERIFY]: 24 * 60 * 60,
};

/**
 * Db Run Changes.
 *
 * @param {*} query - query.
 * @param {*} params - params.
 * @returns {*}
 */
function dbRunChanges(query, params = []) {
    return new Promise((resolve, reject) => {
        database.run(query, params, function (err) {
            if (err) return reject(err);
            resolve(this.changes || 0);
        });
    });
}

/**
 * Issue Account Token.
 *
 * @param {*} userId - userId.
 * @param {*} purpose - purpose.
 * @param {number|null} [poolId] - Target pool for pool PIN reset tokens.
 * @returns {Promise<*>}
 */
async function issueAccountToken(userId, purpose, poolId = null) {
    requireInternalParam(userId, "userId");
    requireInternalParam(purpose, "purpose");

    const now = Math.floor(Date.now() / 1000);
    const token = crypto.randomBytes(64).toString("hex");
    const tokenHash = sha256(token);
    const expiresAt = now + (TOKEN_TTL_SECONDS[purpose] || 60 * 60);

    await dbRun(
        "UPDATE user_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND (pool_id = ? OR (pool_id IS NULL AND ? IS NULL))",
        [now, userId, purpose, poolId, poolId]
    );
    await dbRun("INSERT INTO user_tokens (user_id, purpose, token_hash, created_at, expires_at, pool_id) VALUES (?, ?, ?, ?, ?, ?)", [
        userId,
        purpose,
        tokenHash,
        now,
        expiresAt,
        poolId,
    ]);

    return token;
}

/**
 * Consume Account Token.
 *
 * @param {*} token - token.
 * @param {*} purpose - purpose.
 * @param {number|null} [poolId] - Expected target pool.
 * @returns {Promise<*>}
 */
async function consumeAccountToken(token, purpose, poolId = null) {
    requireInternalParam(token, "token");
    requireInternalParam(purpose, "purpose");

    const tokenHash = sha256(String(token));
    const now = Math.floor(Date.now() / 1000);
    const poolClause = poolId === null ? "" : " AND pool_id = ?";
    const params = poolId === null ? [now, tokenHash, purpose, now] : [now, tokenHash, purpose, now, poolId];
    const markedUsed = await dbRunChanges(
        `UPDATE user_tokens SET used_at = ? WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?${poolClause}`,
        params
    );

    if (!markedUsed) {
        return null;
    }

    return dbGet(
        `SELECT users.*
         FROM user_tokens
         JOIN users ON users.id = user_tokens.user_id
         WHERE user_tokens.token_hash = ?
           AND user_tokens.purpose = ?`,
        [tokenHash, purpose]
    );
}

/**
 * Load the password reset email template.
 * @returns {string}
 */
function loadPasswordResetTemplate() {
    if (passwordResetTemplate) {
        return passwordResetTemplate;
    }

    try {
        const resetEmailContent = fs.readFileSync("email-templates/password-reset.hbs", "utf8");
        passwordResetTemplate = handlebars.compile(resetEmailContent);
        return passwordResetTemplate;
    } catch (err) {
        // Log the underlying error for diagnostics, but throw a controlled error outward.
        console.error("Failed to load password reset email template:", err);
        throw new AppError("Failed to load password reset email template.", {
            statusCode: 500,
            event: "user.password.reset.failed",
            reason: "template_load_error",
        });
    }
}

/**
 * Load the pool pin reset email template.
 * @returns {string}
 */
function loadPoolPinResetTemplate() {
    if (poolPinResetTemplate) {
        return poolPinResetTemplate;
    }

    try {
        const resetEmailContent = fs.readFileSync("email-templates/pool-pin-reset.hbs", "utf8");
        poolPinResetTemplate = handlebars.compile(resetEmailContent);
        return poolPinResetTemplate;
    } catch (err) {
        // Log the underlying error for diagnostics, but throw a controlled error outward.
        console.error("Failed to load pool pin reset email template:", err);
        throw new AppError("Failed to load pool pin reset email template.", {
            statusCode: 500,
            event: "user.poolPin.reset.failed",
            reason: "template_load_error",
        });
    }
}

/**
 * Load the PIN reset email template.
 * @returns {string}
 */
function loadPinResetTemplate() {
    if (pinResetTemplate) {
        return pinResetTemplate;
    }

    try {
        const pinResetEmailContent = fs.readFileSync("email-templates/pin-reset.hbs", "utf8");
        pinResetTemplate = handlebars.compile(pinResetEmailContent);
        return pinResetTemplate;
    } catch (err) {
        console.error("Failed to load PIN reset email template:", err);
        throw new AppError("Failed to load PIN reset email template.", {
            statusCode: 500,
            event: "user.pin.reset.failed",
            reason: "template_load_error",
        });
    }
}

/**
 * Send a PIN reset email.
 * @param {number} userId - userId.
 * @returns {Promise<void>}
 */
async function requestPinReset(userId) {
    requireInternalParam(userId, "userId");

    const user = await getUserDataFromDb(userId);
    if (!user) {
        throw new NotFoundError("User not found.", {
            event: "user.pin.reset.request.failed",
            reason: "user_not_found",
        });
    }

    const template = loadPinResetTemplate();
    const token = await issueAccountToken(userId, TOKEN_PURPOSES.PIN_RESET);

    sendMail(user.email, "Formbar PIN Reset", template({ resetUrl: `${frontendUrl}/user/me/pin?code=${token}` }));
}

/**
 * Reset a PIN using a token.
 * @param {string} newPin - newPin.
 * @param {string} token - token.
 * @returns {Promise<void>}
 */
async function resetPin(newPin, token) {
    requireInternalParam(newPin, "newPin");
    requireInternalParam(token, "token");

    const user = await consumeAccountToken(token, TOKEN_PURPOSES.PIN_RESET);
    if (!user) {
        throw new NotFoundError("PIN reset token is invalid or has expired.", {
            event: "user.pin.reset.failed",
            reason: "invalid_token",
        });
    }

    const hashedPin = await hashBcrypt(String(newPin));
    await dbRun("UPDATE users SET pin = ? WHERE id = ?", [hashedPin, user.id]);
}

/**
 * Update a user PIN after verifying the old PIN.
 * @param {number} userId - userId.
 * @param {string} oldPin - oldPin.
 * @param {string} newPin - newPin.
 * @returns {Promise<void>}
 */
async function updatePin(userId, oldPin, newPin) {
    requireInternalParam(userId, "userId");
    requireInternalParam(newPin, "newPin");

    const user = await getUserDataFromDb(userId);
    if (!user) {
        throw new NotFoundError("User not found.", {
            event: "user.pin.update.failed",
            reason: "user_not_found",
        });
    }

    // If user already has a PIN, verify the old one matches
    if (user.pin) {
        requireInternalParam(oldPin, "oldPin");
        const oldPinMatches = await compareBcrypt(String(oldPin), user.pin);
        if (!oldPinMatches) {
            const AuthError = require("@errors/auth-error");
            throw new AuthError("Current PIN is incorrect.", {
                event: "user.pin.update.failed",
                reason: "incorrect_old_pin",
            });
        }
    }

    const hashedPin = await hashBcrypt(String(newPin));
    await dbRun("UPDATE users SET pin = ? WHERE id = ?", [hashedPin, userId]);
}

/**
 * Verify a user PIN.
 * @param {number} userId - userId.
 * @param {string} pin - pin.
 * @returns {Promise<boolean>}
 */
async function verifyPin(userId, pin) {
    requireInternalParam(userId, "userId");
    requireInternalParam(pin, "pin");

    const user = await getUserDataFromDb(userId);
    if (!user) {
        throw new NotFoundError("User not found.", {
            event: "user.pin.verify.failed",
            reason: "user_not_found",
        });
    }

    if (!user.pin) {
        throw new AppError("No PIN is set for this account. Please create one first.", {
            statusCode: 400,
            event: "user.pin.verify.failed",
            reason: "pin_not_set",
        });
    }

    const pinMatches = await compareBcrypt(String(pin), user.pin);
    if (!pinMatches) {
        const AuthError = require("@errors/auth-error");
        throw new AuthError("PIN is incorrect.", {
            event: "user.pin.verify.failed",
            reason: "incorrect_pin",
        });
    }

    return true;
}

/**
 * Load the verification email template.
 * @returns {string}
 */
function loadVerifyEmailTemplate() {
    if (verifyEmailTemplate) {
        return verifyEmailTemplate;
    }

    try {
        const verifyEmailContent = fs.readFileSync("email-templates/verify-email.hbs", "utf8");
        verifyEmailTemplate = handlebars.compile(verifyEmailContent);
        return verifyEmailTemplate;
    } catch (err) {
        console.error("Failed to load verification email template:", err);
        throw new AppError("Failed to load verification email template.", {
            statusCode: 500,
            event: "user.verify.email.failed",
            reason: "template_load_error",
        });
    }
}

/**
 * Get user data from the database.
 * @param {number} userId - userId.
 * @returns {Promise<Object|null>}
 */
async function getUserDataFromDb(userId) {
    const user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
    if (!user) {
        return user;
    }

    const roles = await getUserRoles(userId);
    const scopes = getUserScopes({ ...user, roles });
    const { pog_meter: pogMeterColumn, ...userData } = user;

    return {
        ...userData,
        pogMeter: pogMeterColumn ?? user.pogMeter ?? 0,
        roles,
        scopes,
        role: getUserRoleName({ ...userData, pogMeter: pogMeterColumn ?? user.pogMeter ?? 0, roles }),
        permissions: computeGlobalPermissionLevel(scopes.global),
        classPermissions: computeClassPermissionLevel(scopes.class),
    };
}

/**
 * Send a password reset email.
 * @param {string} email - email.
 * @returns {Promise<void>}
 */
async function requestPasswordReset(email) {
    requireInternalParam(email, "email");

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await dbGet("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
    if (!user) {
        return true;
    }

    const template = loadPasswordResetTemplate();
    const secret = await issueAccountToken(user.id, TOKEN_PURPOSES.PASSWORD_RESET);

    sendMail(normalizedEmail, "Formbar Password Change", template({ resetUrl: `${frontendUrl}/user/me/password?code=${secret}` }));
    return true;
}

/**
 * Send a pin reset email for a pool.
 * @param {string} email - email.
 * @param {number} id - pool id.
 * @returns {Promise<void>}
 */
async function requestPoolPinReset(email, id) {
    requireInternalParam(email, "email");
    requireInternalParam(id, "id");

    const normalizedEmail = String(email).trim().toLowerCase();
    const pool = await dbGet("SELECT id FROM digipog_pools WHERE id = ?", [id]);
    if (!pool) {
        throw new NotFoundError("Pool not found.", {
            event: "user.poolPin.reset.request.failed",
            reason: "pool_not_found",
        });
    }

    const user = await dbGet("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
    if (!user) {
        return true;
    }

    const template = loadPoolPinResetTemplate();
    const secret = await issueAccountToken(user.id, TOKEN_PURPOSES.POOL_PIN_RESET, id);

    sendMail(normalizedEmail, "Formbar Pool Pin Change", template({ resetUrl: `${frontendUrl}/pool/${id}/pin/reset?code=${secret}` }));
    return true;
}

/**
 * Send a verification email.
 * @param {number} userId - userId.
 * @param {string} apiBaseUrl - apiBaseUrl.
 * @returns {Promise<void>}
 */
async function requestVerificationEmail(userId, apiBaseUrl) {
    requireInternalParam(userId, "userId");

    const user = await dbGet("SELECT id, email, verified FROM users WHERE id = ?", [userId]);
    if (!user) {
        throw new NotFoundError("User not found.", {
            event: "user.verify.email.failed",
            reason: "user_not_found",
        });
    }

    if (user.verified) {
        return { alreadyVerified: true };
    }

    const template = loadVerifyEmailTemplate();
    const secret = await issueAccountToken(user.id, TOKEN_PURPOSES.EMAIL_VERIFY);
    const verifyUrl = frontendUrl ? `${frontendUrl}/user/verify/email?code=${secret}` : `${apiBaseUrl}/api/v1/user/verify/email?code=${secret}`;

    sendMail(user.email, "Formbar Email Verification", template({ verifyUrl }));

    return { alreadyVerified: false };
}

/**
 * Verify an email address from a code.
 * @param {string} code - code.
 * @returns {Promise<void>}
 */
async function verifyEmailFromCode(code) {
    requireInternalParam(code, "code");

    const user = await consumeAccountToken(code, TOKEN_PURPOSES.EMAIL_VERIFY);
    if (!user) {
        throw new NotFoundError("Verification token is invalid or has expired.", {
            event: "user.verify.email.failed",
            reason: "invalid_code",
        });
    }

    if (!user.verified) {
        await dbRun("UPDATE users SET verified = 1 WHERE id = ?", [user.id]);
        if (classStateStore.getUser(user.email)) {
            classStateStore.updateUser(user.email, { verified: 1 });
        }
    }

    return { userId: user.id, alreadyVerified: Boolean(user.verified) };
}

/**
 * Reset a password using a token.
 * @param {string} password - password.
 * @param {string} token - token.
 * @returns {Promise<void>}
 */
async function resetPassword(password, token) {
    requireInternalParam(password, "password");
    requireInternalParam(token, "token");
    assertValidPassword(password, { event: "user.password.reset.failed", reason: "invalid_password" });

    const user = await consumeAccountToken(token, TOKEN_PURPOSES.PASSWORD_RESET);
    if (!user) {
        throw new NotFoundError("Password reset token is invalid or has expired.", {
            event: "user.password.reset.failed",
            reason: "invalid_token",
        });
    }

    const hashedPassword = await hashBcrypt(password);
    await dbRun("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, user.id]);
    return true;
}

/**
 * Reset a pool pin using a token.
 * @param {string} pin - pin.
 * @param {number} poolId - pool id.
 * @param {string} token - token.
 * @returns {Promise<void>}
 */
async function resetPoolPin(pin, token, poolId) {
    requireInternalParam(pin, "pin");
    requireInternalParam(token, "token");
    requireInternalParam(poolId, "poolId");

    const pool = await dbGet("SELECT id FROM digipog_pools WHERE id = ?", [poolId]);

    if (!pool) {
        throw new NotFoundError("Invalid pool id for pool pin reset.", {
            event: "user.poolPin.reset.failed",
            reason: "invalid_id",
        });
    }

    const user = await consumeAccountToken(token, TOKEN_PURPOSES.POOL_PIN_RESET, poolId);
    if (!user) {
        throw new NotFoundError("Pool pin reset token is invalid or has expired.", {
            event: "user.poolPin.reset.failed",
            reason: "invalid_token",
        });
    }

    const hashedPin = await hashBcrypt(pin);
    await dbRun("UPDATE digipog_pools SET pin = ? WHERE id = ?", [hashedPin, poolId]);
    return true;
}

/**
 * Update a password after verifying the old password.
 * @param {number} userId - userId.
 * @param {string} oldPassword - oldPassword.
 * @param {string} newPassword - newPassword.
 * @returns {Promise<void>}
 */
async function updatePassword(userId, oldPassword, newPassword) {
    requireInternalParam(userId, "userId");
    requireInternalParam(newPassword, "newPassword");
    assertValidPassword(newPassword, { event: "user.password.update.failed", reason: "invalid_password" });

    const user = await getUserDataFromDb(userId);
    if (!user) {
        throw new NotFoundError("User not found.", {
            event: "user.password.update.failed",
            reason: "user_not_found",
        });
    }

    if (user.password) {
        requireInternalParam(oldPassword, "oldPassword");

        const oldPasswordMatches = await compareBcrypt(oldPassword, user.password);
        if (!oldPasswordMatches) {
            const AuthError = require("@errors/auth-error");
            throw new AuthError("Current password is incorrect.", {
                event: "user.password.update.failed",
                reason: "incorrect_old_password",
            });
        }
    }

    const hashedPassword = await hashBcrypt(newPassword);
    await dbRun("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, userId]);
    return true;
}

// User lookup

/**
 * Gets the class id for the given user
 * @param {string} email - User email.
 * @returns {number|null|Error}
 */
function getUserClass(email) {
    try {
        const user = classStateStore.getUser(email);
        if (user?.activeClass) {
            return user.activeClass;
        }

        const classrooms = classStateStore.getAllClassrooms?.() || {};
        for (const [classId, classroom] of Object.entries(classrooms)) {
            if (classroom?.students?.[email]) {
                const numericClassId = Number(classId);
                return Number.isNaN(numericClassId) ? classId : numericClassId;
            }
        }
        return null;
    } catch (err) {
        return err;
    }
}

/**
 * Gets the current user's data including class/session info.
 * @param {Object} userIdentifier - User lookup data.
 * @returns {Promise<Object|Error>}
 */
async function getUser(userIdentifier) {
    try {
        const email = userIdentifier.email || (await getEmailFromId(userIdentifier.id));
        if (email instanceof Error) throw email;
        if (email.error) throw email;

        let classId = getUserClass(email);
        if (classId instanceof Error) throw classId;

        let dbUser = await new Promise((resolve, reject) => {
            database.get("SELECT id FROM users WHERE email = ?", [email], async (err, row) => {
                try {
                    if (err) throw err;
                    if (!row) {
                        resolve({ error: classId ? "user does not exist in this class" : "user does not exist" });
                        return;
                    }
                    resolve(await getUserDataFromDb(row.id));
                } catch (error) {
                    reject(error);
                }
            });
        });

        if (dbUser.error) return dbUser;

        let userData = { loggedIn: false, ...dbUser, help: null, break: null, pogMeter: dbUser.pogMeter ?? 0, classId, classPermissions: null };

        const classroom = classStateStore.getClassroom(classId);
        if (classroom && classroom.students[dbUser.email]) {
            let cdUser = classroom.students[dbUser.email];
            if (cdUser) {
                userData.loggedIn = true;
                userData.help = cdUser.help;
                userData.break = cdUser.break;
                userData.pogMeter = cdUser.pogMeter ?? userData.pogMeter;
                userData.roles = {
                    global: dbUser.roles?.global || [],
                    class: cdUser.roles?.class || [],
                };
            }
        }

        if (classroom) {
            const classroomOwnerId = classroom.owner || (await dbGet("SELECT owner FROM classroom WHERE id = ?", [classId]))?.owner;
            const activeClassUser = classroom.students[dbUser.email];
            const effectiveClassUser = activeClassUser
                ? {
                    ...activeClassUser,
                    isClassOwner: activeClassUser.isClassOwner === true || dbUser.id === classroomOwnerId,
                }
                : dbUser.id === classroomOwnerId
                    ? { id: dbUser.id, email: dbUser.email, roles: { global: dbUser.roles?.global || [], class: [] }, isClassOwner: true }
                    : null;

            if (effectiveClassUser) {
                const classScopes = getUserScopes(effectiveClassUser, classroom).class;
                userData.classPermissions = computeClassPermissionLevel(classScopes, {
                    isOwner: Boolean(effectiveClassUser.isClassOwner),
                    globalScopes: getUserScopes(effectiveClassUser).global,
                });
            }
        }

        return userData;
    } catch (err) {
        return err;
    }
}

/**
 * Gets the classes owned by a user from their email.
 * @param {string} email - User email.
 * @returns {Promise<Object[]>}
 */
async function getUserOwnedClasses(email) {
    const userId = (await dbGet("SELECT id FROM users WHERE email = ?", [email])).id;
    return dbGetAll("SELECT * FROM classroom WHERE owner=?", [userId]);
}

// Session Management

/**
 * Logs a user out from a specific socket, cleaning up session state.
 * @param {Object} socket - Socket connection.
 * @returns {void}
 */
function logout(socket) {
    const email = socket.request.session.email;
    const userId = socket.request.session.userId;
    const classId = socket.request.session.classId;

    let isLastSession = false;
    const { emptyAfterRemoval } = socketStateStore.removeUserSocket(email, socket.id);
    isLastSession = emptyAfterRemoval;

    if (classId) socket.leave(`class-${classId}`);

    socket.request.session.destroy((err) => {
        try {
            if (err) throw err;
            socket.emit("reload");
            socketStateStore.removeLastActivity(email, socket.id);

            if (isLastSession) {
                const user = classStateStore.getUser(email);
                if (user) {
                    user.activeClass = null;
                    user.break = false;
                    user.help = false;
                }
                if (user && (user.isGuest || user.permissions === GUEST_PERMISSIONS)) {
                    classStateStore.removeUser(email);
                }
                if (!classId) return;

                const classroom = classStateStore.getClassroom(classId);
                if (classroom) {
                    const student = classroom.students[email];
                    if (student) {
                        if (student.isGuest) {
                            delete classroom.students[email];
                        } else {
                            student.activeClass = null;
                            student.break = false;
                            student.help = false;
                            student.isOffline = true;
                        }
                    }
                    userUpdateSocket(email, "classUpdate", classId);
                }

                database.get("SELECT * FROM classroom WHERE owner=? AND id=?", [userId, classId], (err, classroom) => {
                    if (err) {
                        handleSocketError(err, socket, "logout:database");
                    }
                    if (classroom) {
                        endClass(classroom.id);
                    }
                });
            }
        } catch (err) {
            handleSocketError(err, socket, "logout");
        }
    });
}

/**
 * Deletes a user account and all associated data.
 * @param {number|string} userId - User ID or pending user secret.
 * @param {Object} userSession - Session user data.
 * @returns {Promise<string|void>}
 */
async function deleteUser(userId, userSession) {
    try {
        const user = await dbGet("SELECT * FROM users WHERE id=?", [userId]);
        let tempUser;
        if (!user) {
            tempUser = await dbGet("SELECT * FROM temp_user_creation_data WHERE secret=?", [userId]);
            if (!tempUser) return "User not found";
            await dbRun("DELETE FROM temp_user_creation_data WHERE secret=?", [userId]);
        }

        const userSocketsMap = socketStateStore.getUserSocketsByEmail(user ? user.email : tempUser.email);
        if (userSocketsMap) {
            const anySocket = Object.values(userSocketsMap)[0];
            if (anySocket) logout(anySocket);
        }

        try {
            if (user) {
                await dbRun("BEGIN TRANSACTION");
                await Promise.all([
                    dbRun("DELETE FROM users WHERE id=?", userId),
                    dbRun("DELETE FROM classusers WHERE studentId=?", userId),
                    dbRun("DELETE FROM shared_polls WHERE userId=?", userId),
                ]);
                await deleteCustomPolls(userId);
                await deleteClassrooms(userId);

                const student = classStateStore.getUser(user.email);
                if (student) {
                    const activeClass = classStateStore.getUser(user.email).activeClass;
                    const classroom = classStateStore.getClassroom(activeClass);
                    classStateStore.removeUser(user.email);
                    if (classroom) {
                        delete classroom.students[user.email];
                        userUpdateSocket(user.email, "classUpdate");
                    }
                }
                await dbRun("COMMIT");
            }
            await managerUpdate();
            return true;
        } catch (err) {
            await dbRun("ROLLBACK");
            throw err;
        }
    } catch (err) {
        return "There was an internal server error. Please try again.";
    }
}

module.exports = {
    getUserDataFromDb,
    requestPasswordReset,
    requestVerificationEmail,
    verifyEmailFromCode,
    resetPassword,
    updatePassword,
    requestPinReset,
    resetPin,
    updatePin,
    verifyPin,
    getUser,
    getUserOwnedClasses,
    getUserClass,
    logout,
    deleteUser,
    requestPoolPinReset,
    resetPoolPin
};
