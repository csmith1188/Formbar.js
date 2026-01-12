const { compare } = require("bcrypt");
const { dbGet, dbRun } = require("../../../modules/database");
const { privateKey } = require("../../../modules/config");
const jwt = require("jsonwebtoken");

/**
 * Authenticates a user with email and password credentials
 * @async
 * @param {string} email - The user's email address
 * @param {string} password - The user's plain text password
 * @returns {Promise<string|Error>} Returns an access token on success, or an Error object with code 'INVALID_CREDENTIALS' on failure
 * @throws {Error} Throws an error if private key is not available
 */
async function login(email, password) {
    if (!privateKey) {
        throw new Error("Private key is not available for JWT signing.");
    }

    const userData = await dbGet("SELECT * FROM users WHERE email = ?", [email]);
    if (!userData) {
        return invalidCredentials();
    }

    const passwordMatches = await compare(password, userData.password);
    if (passwordMatches) {
        const tokens = generateAuthTokens(userData);
        const decodedRefreshToken = jwt.decode(tokens.refreshToken);
        await dbRun("INSERT OR REPLACE INTO refresh_tokens (user_id, refresh_token, exp) VALUES (?, ?, ?)", [
            userData.id,
            tokens.refreshToken,
            decodedRefreshToken.iat,
        ]);

        return tokens.accessToken;
    } else {
        return invalidCredentials();
    }
}

/**
 * Refreshes user authentication using a refresh token
 * @async
 * @param {string} refreshToken - The refresh token to validate and use for generating new tokens
 * @returns {Promise<String|Error>} Returns void on success, or an Error object with code 'INVALID_CREDENTIALS' if the refresh token is invalid
 */
async function refreshLogin(refreshToken) {
    const dbRefreshToken = await dbGet("SELECT * FROM refresh_tokens WHERE refresh_token = ?", [refreshToken]);
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
    await dbRun("INSERT INTO refresh_tokens (user_id, refresh_token, exp) VALUES (?, ?, ?)", [
        dbRefreshToken.user_id,
        authTokens.refreshToken,
        decodedRefreshToken.iat,
    ]);

    return authTokens.accessToken;
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
            refreshToken: refreshToken,
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
 * @param token
 * @returns {Object}
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, privateKey, { algorithms: ["RS256"] });
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

module.exports = {
    login,
    refreshLogin,
    verifyToken,
};
