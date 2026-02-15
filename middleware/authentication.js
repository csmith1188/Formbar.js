const { classInformation } = require("@modules/class/classroom");
const { settings } = require("@modules/config");
const { PAGE_PERMISSIONS, GUEST_PERMISSIONS } = require("@modules/permissions");
const { dbGetAll, dbRun } = require("@modules/database");
const { verifyToken, cleanupExpiredAuthorizationCodes } = require("@services/auth-service");
const AuthError = require("@errors/auth-error");
const NotFoundError = require("@errors/not-found-error");
const ForbiddenError = require("@errors/forbidden-error");

const whitelistedIps = {};
const blacklistedIps = {};

// Removes expired refresh tokens and authorization codes from the database
async function cleanRefreshTokens() {
    try {
        const refreshTokens = await dbGetAll("SELECT * FROM refresh_tokens");
        for (const refreshToken of refreshTokens) {
            if (Date.now() >= refreshToken.exp) {
                await dbRun("DELETE FROM refresh_tokens WHERE token_hash = ?", [refreshToken.token_hash]);
            }
        }
        // Also clean up expired authorization codes
        await cleanupExpiredAuthorizationCodes();
    } catch (err) {}
}

/**
 * Middleware to verify that a user is authenticated.
 *
 * Place at the start of any route that requires an authenticated user.
 * Verifies the Authorization header, decodes the access token and attaches
 * user information to `req.user` for downstream handlers.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @throws {AuthError} When no token is provided, the token is invalid,
 *                     the token is missing an email, or the user is not found.
 * @returns {void}
 */
function isAuthenticated(req, res, next) {
    const accessToken = req.headers.authorization ? req.headers.authorization.replace("Bearer ", "") : null;
    if (!accessToken) {
        throw new AuthError("User is not authenticated");
    }

    const decodedToken = verifyToken(accessToken);
    if (decodedToken.error) {
        throw new AuthError("Invalid access token provided.");
    }

    const email = decodedToken.email;
    if (!email) {
        throw new AuthError("Invalid access token provided. Missing 'email'.");
    }

    const user = classInformation.users[email];
    if (!user) {
        throw new AuthError("User is not authenticated");
    }

    // Attach user data to req.user for stateless API authentication
    req.user = {
        email: email,
        ...user,
        userId: user.id,
    };

    next();
}

// Create a function to check if the user's email is verified
function isVerified(req, res, next) {
    // Use req.user if available (set by isAuthenticated), otherwise decode from token
    let email = req.user?.email;
    if (!email) {
        const accessToken = req.headers.authorization ? req.headers.authorization.replace("Bearer ", "") : null;
        if (!accessToken) {
            throw new AuthError("User is not authenticated.");
        }

        const decodedToken = verifyToken(accessToken);
        if (!decodedToken.error && decodedToken.email) {
            email = decodedToken.email;
        }
    }

    if (!email) {
        throw new AuthError("User is not authenticated.");
    }

    const user = classInformation.users[email];
    // If the user is verified or email functionality is disabled...
    if ((user && user.verified) || !settings.emailEnabled || (user && user.permissions == GUEST_PERMISSIONS)) {
        next();
    } else {
        throw new AuthError("User email is not verified.");
    }
}

// Check if user has the permission levels to enter that page
async function permCheck(req, res, next) {
    const email = req.user?.email;
    if (!email) {
        throw new AuthError("User is not authenticated");
    }

    if (req.url) {
        // Defines users desired endpoint
        let urlPath = req.url;

        // Checks if url has a / in it and removes it from the string
        if (urlPath.indexOf("/") != -1) {
            urlPath = urlPath.slice(urlPath.indexOf("/") + 1);
        }

        // Check for ?(urlParams) and removes it from the string
        if (urlPath.indexOf("?") != -1) {
            urlPath = urlPath.slice(0, urlPath.indexOf("?"));
        }

        // Check for a second / in the url and remove it from the string
        if (urlPath.indexOf("/") != -1) {
            urlPath = urlPath.slice(0, urlPath.indexOf("/"));
        }

        // Ensure the url path is all lowercase
        urlPath = urlPath.toLowerCase();
        if (!PAGE_PERMISSIONS[urlPath]) {
            throw new NotFoundError(`${urlPath} is not in the page permissions`);
        }

        const user = classInformation.users[email];
        if (!user) {
            throw new AuthError("User not found");
        }

        // Checks if users permissions are high enough
        if (PAGE_PERMISSIONS[urlPath].classPage && user.classPermissions >= PAGE_PERMISSIONS[urlPath].permissions) {
            next();
        } else if (!PAGE_PERMISSIONS[urlPath].classPage && user.permissions >= PAGE_PERMISSIONS[urlPath].permissions) {
            next();
        } else {
            throw new ForbiddenError("You do not have permissions to access this page.");
        }
    }
}

function checkIPBanned(ip) {
    if (!ip) return false;
    if (settings.whitelistActive && Object.keys(whitelistedIps).length > 0) {
        const isWhitelisted = Object.values(whitelistedIps).some((value) => ip.startsWith(value.ip));
        if (!isWhitelisted) {
            return true;
        }
    }

    if (settings.blacklistActive && Object.keys(blacklistedIps).length > 0) {
        const isBlacklisted = Object.values(blacklistedIps).some((value) => ip.startsWith(value.ip));
        if (isBlacklisted) {
            return true;
        }
    }

    return false;
}

module.exports = {
    cleanRefreshTokens,

    // Whitelisted/Blacklisted IP addresses
    whitelistedIps,
    blacklistedIps,

    // Authentication functions
    isAuthenticated,
    isVerified,
    permCheck,
    checkIPBanned,
};
