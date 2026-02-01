const { compare, hash } = require("bcrypt");
const { dbGet, dbRun, dbGetAll } = require("@modules/database");
const { privateKey, publicKey } = require("@modules/config");
const { MANAGER_PERMISSIONS, STUDENT_PERMISSIONS } = require("@modules/permissions");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const AppError = require("@errors/app-error");
const { requireInternalParam } = require("@modules/error-wrapper");
const { JWT } = require("google-auth-library");

const passwordRegex = /^[a-zA-Z0-9!@#$%^&*()\-_=+{}\[\]<>,.:;'"~?\/|\\]{5,20}$/;
const displayRegex = /^[a-zA-Z0-9_ ]{5,20}$/;

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
        throw new AppError("Either the public key or private key is not available for JWT signing.", 500);
    }

    if (!passwordRegex.test(password)) {
        return { error: "Password must be 5-20 characters long and can only contain letters, numbers, and special characters." };
    }

    if (!displayRegex.test(displayName)) {
        return { error: "Display name must be 5-20 characters long and can only contain letters, numbers, spaces, and underscores." };
    }

    // Normalize email to lowercase to prevent duplicate accounts
    email = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await dbGet("SELECT * FROM users WHERE email = ? OR displayName = ?", [email, displayName]);
    if (existingUser) {
        return { error: "A user with that email or display name already exists." };
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
    await dbRun("INSERT INTO refresh_tokens (user_id, refresh_token, exp, token_type) VALUES (?, ?, ?, ?)", [
        userData.id,
        tokens.refreshToken,
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
        throw new AppError("Either the public key or private key is not available for JWT signing.", 500);
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
        await dbRun("INSERT INTO refresh_tokens (user_id, refresh_token, exp, token_type) VALUES (?, ?, ?, ?)", [
            userData.id,
            tokens.refreshToken,
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

    const dbRefreshToken = await dbGet("SELECT * FROM refresh_tokens WHERE refresh_token = ? AND token_type = 'auth'", [refreshToken]);
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
    await dbRun("DELETE FROM refresh_tokens WHERE refresh_token = ?", [refreshToken]);
    await dbRun("INSERT INTO refresh_tokens (user_id, refresh_token, exp, token_type) VALUES (?, ?, ?, ?)", [
        dbRefreshToken.user_id,
        authTokens.refreshToken,
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
        throw new AppError("Either the public key or private key is not available for JWT signing.", 500);
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
    await dbRun("DELETE FROM refresh_tokens WHERE user_id = ? AND token_type = 'auth'", [userData.id]);
    await dbRun("INSERT INTO refresh_tokens (user_id, refresh_token, exp, token_type) VALUES (?, ?, ?, ?)", [
        userData.id,
        tokens.refreshToken,
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
 * @param {string} params.state - The CSRF state token
 * @param {string} params.authorization - The user's authorization token
 * @returns {string} A newly generated authorization code
 */
function generateAuthorizationCode({ client_id, redirect_uri, scope, state, authorization }) {
    requireInternalParam(client_id, "client_id");
    requireInternalParam(redirect_uri, "redirect_uri");
    requireInternalParam(scope, "scope");
    requireInternalParam(state, "state");
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

    // Ensure the redirect_uri and client_id match those embedded in the authorization code
    if (authorizationCodeData.redirect_uri !== redirect_uri) {
        throw new AppError("redirect_uri does not match the original authorization request.", 400);
    }
    if (authorizationCodeData.aud !== client_id) {
        throw new AppError("client_id does not match the original authorization request.", 400);
    }
    const accessToken = jwt.sign({ id: authorizationCodeData.sub }, privateKey, { algorithm: "RS256", expiresIn: "15m" });
    const refreshToken = jwt.sign({ id: authorizationCodeData.sub }, privateKey, { algorithm: "RS256", expiresIn: "30d" });
    const decodedRefreshToken = jwt.decode(refreshToken);

    // Persist the OAuth refresh token to the database
    await dbRun("INSERT INTO refresh_tokens (user_id, refresh_token, exp, token_type) VALUES (?, ?, ?, ?)", [
        authorizationCodeData.sub,
        refreshToken,
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

    // Verify the refresh token exists in the database as an OAuth token
    const dbRefreshToken = await dbGet("SELECT * FROM refresh_tokens WHERE refresh_token = ? AND token_type = 'oauth'", [refresh_token]);
    if (!dbRefreshToken) {
        throw new AppError("Refresh token not found or has been revoked.", 401);
    }

    const accessToken = jwt.sign({ id: refreshTokenData.id }, privateKey, { algorithm: "RS256", expiresIn: "15m" });
    const newRefreshToken = jwt.sign({ id: refreshTokenData.id }, privateKey, { algorithm: "RS256", expiresIn: "30d" });
    const decodedRefreshToken = jwt.decode(newRefreshToken);

    // Rotate the refresh token: delete old, insert new
    await dbRun("DELETE FROM refresh_tokens WHERE refresh_token = ?", [refresh_token]);
    await dbRun("INSERT INTO refresh_tokens (user_id, refresh_token, exp, token_type) VALUES (?, ?, ?, ?)", [
        refreshTokenData.id,
        newRefreshToken,
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

    // Delete the token from the database (only OAuth tokens)
    await dbRun("DELETE FROM refresh_tokens WHERE refresh_token = ? AND token_type = 'oauth'", [token]);
    return true;
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
};
