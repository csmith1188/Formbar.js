const { compare, hash } = require("bcrypt");
const { dbGet, dbRun, dbGetAll } = require("@modules/database");
const { privateKey, publicKey } = require("@modules/config");
const { MANAGER_PERMISSIONS, STUDENT_PERMISSIONS } = require("@modules/permissions");
const { requireInternalParam } = require("@modules/error-wrapper");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const AppError = require("@errors/app-error");
const ValidationError = require("@errors/validation-error");
const ConflictError = require("@errors/conflict-error");

const passwordRegex = /^[a-zA-Z0-9!@#$%^&*()\-_=+{}\[\]<>,.:;'"~?\/|\\]{5,20}$/;
const displayRegex = /^[a-zA-Z0-9_ ]{5,20}$/;

/**
 * Generates a SHA-256 hash of the given token.
 * This is used to store tokens securely without storing the actual token value.
 * @param {string} token - The token to hash
 * @returns {string} The SHA-256 hash in hex format
 */
function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Registers a new user with email and password
 * @async
 * @param {string} email - The user's email address
 * @param {string} password - The user's plain text password
 * @param {string} displayName - The user's display name
 * @returns {Promise<{tokens: {accessToken: string, refreshToken: string}, user: Object}|{error: string}>} Returns an object with tokens and user data on success, or an error object on failure
 */
async function register(email, password, displayName) {
    if (!privateKey || !publicKey) {
        throw new AppError("Either the public key or private key is not available for JWT signing.", {
            event: "auth.register.failed",
            reason: "missing_keys",
        });
    }

    if (!passwordRegex.test(password)) {
        throw new ValidationError("Password must be 5-20 characters long and can only contain letters, numbers, and special characters.", {
            event: "auth.register.failed",
            reason: "invalid_password",
        });
    }

    if (!displayRegex.test(displayName)) {
        throw new ValidationError("Display name must be 5-20 characters long and can only contain letters, numbers, spaces, and underscores.", {
            event: "auth.register.failed",
            reason: "invalid_display_name",
        });
    }

    // Normalize email to lowercase to prevent duplicate accounts
    email = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await dbGet("SELECT * FROM users WHERE email = ? OR displayName = ?", [email, displayName]);
    if (existingUser) {
        throw new ConflictError("A user with that email or display name already exists.", { event: "auth.register.failed", reason: "user_exists" });
    }

    const hashedPassword = await hash(password, 10);
    const apiKey = crypto.randomBytes(64).toString("hex");
    const secret = crypto.randomBytes(256).toString("hex");

    // Determine permissions
    // The first user always gets manager permissions
    const allUsers = await dbGetAll("SELECT * FROM users", []);
    const permissions = allUsers.length === 0 ? MANAGER_PERMISSIONS : STUDENT_PERMISSIONS;

    // Create the new user in the database
    const userId = await dbRun(`INSERT INTO users (email, password, permissions, API, secret, displayName, verified) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        email,
        hashedPassword,
        permissions,
        apiKey,
        secret,
        displayName,
        0,
    ]);

    // Get the new user's data
    const userData = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);

    // Generate tokens
    const tokens = generateAuthTokens(userData);
    const decodedRefreshToken = jwt.decode(tokens.refreshToken);
    const tokenHash = hashToken(tokens.refreshToken);
    await dbRun("INSERT INTO refresh_tokens (user_id, token_hash, exp, token_type) VALUES (?, ?, ?, ?)", [
        userData.id,
        tokenHash,
        decodedRefreshToken.exp,
        "auth",
    ]);

    return { tokens, user: userData };
}

/**
 * Authenticates a user with email and password credentials
 * @async
 * @param {string} email - The user's email address
 * @param {string} password - The user's plain text password
 * @returns {Promise<{tokens: {accessToken: string, refreshToken: string}, user: Object}|Error>} Returns an object with tokens and user data on success, or an Error object with code 'INVALID_CREDENTIALS' on failure
 * @throws {Error} Throws an error if private key is not available
 */
async function login(email, password) {
    if (!privateKey || !publicKey) {
        throw new AppError("Either the public key or private key is not available for JWT signing.", {
            statusCode: 500,
            event: "auth.login.failed",
            reason: "missing_keys",
        });
    }

    // Normalize email to lowercase to prevent login issues
    email = email.trim().toLowerCase();

    const userData = await dbGet("SELECT * FROM users WHERE email = ?", [email]);
    if (!userData) {
        return invalidCredentials();
    }

    const passwordMatches = await compare(password, userData.password);
    if (passwordMatches) {
        const tokens = generateAuthTokens(userData);
        const decodedRefreshToken = jwt.decode(tokens.refreshToken);
        const tokenHash = hashToken(tokens.refreshToken);
        await dbRun("INSERT INTO refresh_tokens (user_id, token_hash, exp, token_type) VALUES (?, ?, ?, ?)", [
            userData.id,
            tokenHash,
            decodedRefreshToken.exp,
            "auth",
        ]);

        return { tokens, user: userData };
    } else {
        return invalidCredentials();
    }
}

/**
 * Refreshes user authentication using a refresh token
 * @async
 * @param {string} refreshToken - The refresh token to validate and use for generating new tokens
 * @returns {Promise<{accessToken: string, refreshToken: string}|Error>} Returns an object with accessToken and refreshToken on success, or an Error object with code 'INVALID_CREDENTIALS' if the refresh token is invalid
 */
async function refreshLogin(refreshToken) {
    // Verify the refresh token's signature and expiration before proceeding
    // This prevents the use of expired or tampered tokens
    try {
        jwt.verify(refreshToken, publicKey, { algorithms: ["RS256"] });
    } catch (err) {
        return invalidCredentials();
    }

    const tokenHash = hashToken(refreshToken);
    const dbRefreshToken = await dbGet("SELECT * FROM refresh_tokens WHERE token_hash = ? AND token_type = 'auth'", [tokenHash]);
    if (!dbRefreshToken) {
        return invalidCredentials();
    }

    // Load user data to include email and displayName in the new token
    const userData = await dbGet("SELECT id, email, displayName FROM users WHERE id = ?", [dbRefreshToken.user_id]);
    if (!userData) {
        return invalidCredentials();
    }

    const authTokens = generateAuthTokens(userData);
    const decodedRefreshToken = jwt.decode(authTokens.refreshToken);

    // Delete the old refresh token and insert the new one to avoid UNIQUE constraint issues
    // This handles cases where a user might have multiple refresh tokens in the database
    const newTokenHash = hashToken(authTokens.refreshToken);
    await dbRun("DELETE FROM refresh_tokens WHERE token_hash = ?", [tokenHash]);
    await dbRun("INSERT INTO refresh_tokens (user_id, token_hash, exp, token_type) VALUES (?, ?, ?, ?)", [
        dbRefreshToken.user_id,
        newTokenHash,
        decodedRefreshToken.exp,
        "auth",
    ]);

    return authTokens;
}

/**
 * Generates both access and refresh tokens for a user
 * @param {Object} userData - The user data object
 * @param {number} userData.id - The user's unique identifier
 * @param {string} [userData.email] - The user's email address (used in access token)
 * @param {string} [userData.displayName] - The user's display name (optional, used in access token)
 * @returns {{accessToken: string, refreshToken: string}} An object containing both access and refresh tokens
 */
function generateAuthTokens(userData) {
    const refreshToken = generateRefreshToken(userData);
    const accessToken = jwt.sign(
        {
            id: userData.id,
            email: userData.email,
            displayName: userData.displayName,
        },
        privateKey,
        { algorithm: "RS256", expiresIn: "15m" }
    );

    return { accessToken, refreshToken };
}

/**
 * Generates a refresh token for a user
 * @param {Object} userData - The user data object
 * @param {number} userData.id - The user's unique identifier
 * @returns {string} A JWT refresh token valid for 30 days
 */
function generateRefreshToken(userData) {
    return jwt.sign({ id: userData.id }, privateKey, { algorithm: "RS256", expiresIn: "30d" });
}

/**
 * Verifies the validity of an access token and returns the decoded payload
 * @param {string} token - The JWT access token to verify
 * @returns {Object|{error: string}} Decoded token payload if verification succeeds, or an object with an error property if verification fails
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, publicKey, { algorithms: ["RS256"] });
    } catch (err) {
        return { error: err.toString() };
    }
}

/**
 * Creates a standardized error object for invalid credentials
 * @returns {Error} An Error object with message "Invalid credentials" and code "INVALID_CREDENTIALS"
 */
function invalidCredentials() {
    const err = new Error("Invalid credentials");
    err.code = "INVALID_CREDENTIALS";
    return err;
}

/**
 * Authenticates or registers a user via Google OAuth
 * @async
 * @param {string} email - The user's email address from Google
 * @param {string} displayName - The user's display name from Google
 * @returns {Promise<{tokens: {accessToken: string, refreshToken: string}, user: Object}|{error: string}>} Returns an object with tokens and user data on success, or an error object on failure
 */
async function googleOAuth(email, displayName) {
    if (!privateKey || !publicKey) {
        throw new AppError("Either the public key or private key is not available for JWT signing.", {
            statusCode: 500,
            event: "auth.oauth.failed",
            reason: "missing_keys",
        });
    }

    // Normalize email to lowercase to prevent duplicate accounts
    email = email.trim().toLowerCase();

    let userData = await dbGet("SELECT * FROM users WHERE email = ?", [email]);
    if (!userData) {
        // User doesn't exist, create a new one
        const apiKey = crypto.randomBytes(64).toString("hex");
        const secret = crypto.randomBytes(256).toString("hex");

        // Determine permissions
        // The first user always gets manager permissions
        const allUsers = await dbGetAll("SELECT * FROM users", []);
        const permissions = allUsers.length === 0 ? MANAGER_PERMISSIONS : STUDENT_PERMISSIONS;

        // Insert the new user
        // Users registered through google oauth will have no password
        const result = await dbRun(
            `INSERT INTO users (email, password, permissions, API, secret, displayName, verified) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [email, "", permissions, apiKey, secret, displayName, 1] // Automatically verified via Google
        );

        // Get the newly created user
        userData = await dbGet("SELECT * FROM users WHERE id = ?", [result.lastID]);
    }

    // Generate tokens
    const tokens = generateAuthTokens(userData);
    const decodedRefreshToken = jwt.decode(tokens.refreshToken);

    // Store refresh token (replace if exists for this user's auth tokens only)
    const tokenHash = hashToken(tokens.refreshToken);
    await dbRun("DELETE FROM refresh_tokens WHERE user_id = ? AND token_type = 'auth'", [userData.id]);
    await dbRun("INSERT INTO refresh_tokens (user_id, token_hash, exp, token_type) VALUES (?, ?, ?, ?)", [
        userData.id,
        tokenHash,
        decodedRefreshToken.exp,
        "auth",
    ]);

    return { tokens, user: userData };
}

/**
 * Creates an authorization code for OAuth 2.0 authorization flow
 * @param {Object} params - The authorization parameters
 * @param {string} params.client_id - The client application's ID
 * @param {string} params.redirect_uri - The redirect URI
 * @param {string} params.scope - The requested scopes
 * @param {string} params.authorization - The user's authorization token
 * @returns {string} A newly generated authorization code
 */
function generateAuthorizationCode({ client_id, redirect_uri, scope, authorization }) {
    requireInternalParam(client_id, "client_id");
    requireInternalParam(redirect_uri, "redirect_uri");
    requireInternalParam(scope, "scope");
    requireInternalParam(authorization, "authorization");

    const userData = verifyToken(authorization);
    if (userData.error) {
        throw new AppError("Invalid authorization token provided.", 400);
    }

    return jwt.sign(
        {
            sub: userData.id,
            aud: client_id,
            redirect_uri: redirect_uri,
            scope: scope,
        },
        privateKey,
        { algorithm: "RS256", expiresIn: "5m" }
    );
}

/**
 * Exchanges an authorization code for access and refresh tokens
 * @async
 * @param {Object} params - The token exchange parameters
 * @param {string} params.code - The authorization code
 * @param {string} params.redirect_uri - The redirect URI (must match original)
 * @param {string} params.client_id - The client application's ID
 * @returns {Promise<Object>} Token response with access_token, token_type, expires_in, and refresh_token
 */
async function exchangeAuthorizationCodeForToken({ code, redirect_uri, client_id }) {
    requireInternalParam(code, "code");
    requireInternalParam(redirect_uri, "redirect_uri");
    requireInternalParam(client_id, "client_id");

    const authorizationCodeData = verifyToken(code);
    if (authorizationCodeData.error) {
        throw new AppError("Invalid authorization code provided.", 400);
    }

    // Check if the authorization code has already been used (single-use per RFC 6749 Section 10.5)
    const codeHash = hashToken(code);
    const usedCode = await dbGet("SELECT * FROM used_authorization_codes WHERE code_hash = ?", [codeHash]);
    if (usedCode) {
        throw new AppError("Authorization code has already been used.", 400);
    }

    // Mark the authorization code as used
    await dbRun("INSERT INTO used_authorization_codes (code_hash, used_at, expires_at) VALUES (?, ?, ?)", [
        codeHash,
        Math.floor(Date.now() / 1000),
        authorizationCodeData.exp,
    ]);

    // Ensure the redirect_uri and client_id match those embedded in the authorization code
    if (authorizationCodeData.redirect_uri !== redirect_uri) {
        throw new AppError("redirect_uri does not match the original authorization request.", 400);
    }
    if (authorizationCodeData.aud !== client_id) {
        throw new AppError("client_id does not match the original authorization request.", 400);
    }

    // Load user details so the OAuth access token includes the same claims as regular access tokens
    const user = await dbGet("SELECT id, email, displayName FROM users WHERE id = ?", [authorizationCodeData.sub]);
    if (!user) {
        throw new AppError("User associated with the authorization code was not found.", 404);
    }

    const tokenPayload = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
    };

    const accessToken = jwt.sign(tokenPayload, privateKey, { algorithm: "RS256", expiresIn: "15m" });
    const refreshToken = jwt.sign({ id: user.id }, privateKey, { algorithm: "RS256", expiresIn: "30d" });
    const decodedRefreshToken = jwt.decode(refreshToken);

    // Persist the OAuth refresh token to the database (store hash, not cleartext)
    const refreshTokenHash = hashToken(refreshToken);
    await dbRun("INSERT INTO refresh_tokens (user_id, token_hash, exp, token_type) VALUES (?, ?, ?, ?)", [
        authorizationCodeData.sub,
        refreshTokenHash,
        decodedRefreshToken.exp,
        "oauth",
    ]);

    return {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: refreshToken,
    };
}

/**
 * Exchanges a refresh token for a new access token and refresh token
 * @async
 * @param {Object} params - The token refresh parameters
 * @param {string} params.refresh_token - The refresh token to exchange
 * @returns {Promise<Object>} Token response with access_token, token_type, expires_in, and refresh_token
 */
async function exchangeRefreshTokenForAccessToken({ refresh_token }) {
    requireInternalParam(refresh_token, "refresh_token");

    const refreshTokenData = verifyToken(refresh_token);
    if (refreshTokenData.error) {
        throw new AppError("Invalid refresh token provided.", 400);
    }

    // Verify the refresh token exists in the database as an OAuth token (compare hashes)
    const tokenHash = hashToken(refresh_token);
    const dbRefreshToken = await dbGet("SELECT * FROM refresh_tokens WHERE token_hash = ? AND token_type = 'oauth'", [tokenHash]);
    if (!dbRefreshToken) {
        throw new AppError("Refresh token not found or has been revoked.", 401);
    }

    // Load user details so the OAuth access token includes the same claims as regular access tokens
    const user = await dbGet("SELECT id, email, display_name AS displayName FROM users WHERE id = ?", [refreshTokenData.id]);
    if (!user) {
        throw new AppError("User associated with the refresh token was not found.", 404);
    }

    const tokenPayload = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
    };

    const accessToken = jwt.sign(tokenPayload, privateKey, { algorithm: "RS256", expiresIn: "15m" });
    const newRefreshToken = jwt.sign(tokenPayload, privateKey, { algorithm: "RS256", expiresIn: "30d" });
    const decodedRefreshToken = jwt.decode(newRefreshToken);

    // Rotate the refresh token: delete old, insert new (store hash, not cleartext)
    const newTokenHash = hashToken(newRefreshToken);
    await dbRun("DELETE FROM refresh_tokens WHERE token_hash = ?", [tokenHash]);
    await dbRun("INSERT INTO refresh_tokens (user_id, token_hash, exp, token_type) VALUES (?, ?, ?, ?)", [
        refreshTokenData.id,
        newTokenHash,
        decodedRefreshToken.exp,
        "oauth",
    ]);

    return {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: newRefreshToken,
    };
}

/**
 * Revokes an OAuth refresh token
 * @async
 * @param {string} token - The refresh token to revoke
 * @returns {Promise<boolean>} Returns true if revocation was successful
 */
async function revokeOAuthToken(token) {
    requireInternalParam(token, "token");

    // Delete the token from the database (only OAuth tokens, compare by hash)
    const tokenHash = hashToken(token);
    await dbRun("DELETE FROM refresh_tokens WHERE token_hash = ? AND token_type = 'oauth'", [tokenHash]);
    return true;
}

/**
 * Cleans up expired authorization codes from the database.
 * Should be called periodically to prevent table bloat.
 * @async
 * @returns {Promise<void>}
 */
async function cleanupExpiredAuthorizationCodes() {
    const now = Math.floor(Date.now() / 1000);
    await dbRun("DELETE FROM used_authorization_codes WHERE expires_at < ?", [now]);
}

module.exports = {
    register,
    login,
    refreshLogin,
    verifyToken,
    googleOAuth,
    generateAuthorizationCode,
    exchangeAuthorizationCodeForToken,
    exchangeRefreshTokenForAccessToken,
    revokeOAuthToken,
    cleanupExpiredAuthorizationCodes,
    hashToken,
};
