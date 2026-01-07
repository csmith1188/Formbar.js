const { compare } = require("bcrypt");
const { dbGet, dbRun } = require("../../../modules/database");
const jwt = require("jsonwebtoken");

async function login(email, password) {
    if (!process.env.SECRET) {
        throw new Error("JWT secret is not defined in environment variables.");
    }

    const userData = await dbGet("SELECT * FROM users WHERE email = ?", [email]);
    if (!userData) {
        return invalidCredentials()
    }

    const passwordMatches = await compare(password, userData.password);
    if (passwordMatches) {
        const tokens = generateAuthTokens(userData)
        const decodedRefreshToken = jwt.verify(tokens.refreshToken, process.env.SECRET);
        await dbRun("INSERT INTO refresh_tokens (user_id, refresh_token, exp) VALUES (?, ?, ?)", [userData.id, tokens.refreshToken, decodedRefreshToken.iat]);

        return tokens.accessToken;
    } else {
        return invalidCredentials();
    }
}

async function refreshLogin(refreshToken) {
    const dbRefreshToken = await dbGet("SELECT * FROM refresh_tokens WHERE refresh_token = ?", [refreshToken]);
}

function generateAuthTokens(userData) {
    const refreshToken = generateRefreshToken(userData)
    const accessToken = jwt.sign(
        {
            id: userData.id,
            displayName: userData.displayName,
            refreshToken: refreshToken,
        },
        process.env.SECRET,
        { expiresIn: "15m" }
    );

    return { accessToken, refreshToken }
}

function generateRefreshToken(userData) {
    return jwt.sign(
        { id: userData.id },
        process.env.SECRET,
        { expiresIn: "30d" }
    );
}

function invalidCredentials() {
    const err = new Error("Invalid credentials");
    err.code = "INVALID_CREDENTIALS";
    return err;
}

module.exports = {
    login
}