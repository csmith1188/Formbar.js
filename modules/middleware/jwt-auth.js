const { verifyToken } = require("@services/auth-service");
const { classInformation } = require("@modules/class/classroom");
const { dbGet } = require("@modules/database");
const AuthError = require("@errors/auth-error");

/**
 * JWT authentication middleware
 * Extracts and verifies JWT token from Authorization header, then attaches user data to req.user
 * This is the recommended approach for stateless API authentication
 *
 * @throws {AuthError} If token is missing, invalid, or expired
 */
function jwtAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        throw new AuthError("No authorization token provided");
    }

    // Support both "Bearer <token>" and just "<token>" formats
    const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;

    const decoded = verifyToken(token);

    if (decoded.error) {
        throw new AuthError("Invalid or expired token");
    }

    if (!decoded.email || !decoded.id) {
        throw new AuthError("Token missing required fields");
    }

    // Attach decoded user info directly to request object
    // This becomes the single source of truth for user identity
    req.user = {
        id: decoded.id,
        email: decoded.email,
        displayName: decoded.displayName
    };

    // Optionally enrich with full user data from memory
    // This includes permissions and class information
    const userInMemory = classInformation.users[decoded.email];
    if (userInMemory) {
        req.user.permissions = userInMemory.permissions;
        req.user.classPermissions = userInMemory.classPermissions;
        req.user.activeClass = userInMemory.activeClass;
        req.user.verified = userInMemory.verified;
        req.user.tags = userInMemory.tags;
    }

    next();
}

/**
 * Optional JWT auth middleware
 * Tries to authenticate but doesn't throw if token is missing or invalid
 * Useful for endpoints that work differently for authenticated vs anonymous users
 *
 * If authentication succeeds, req.user will be populated
 * If it fails, req.user will be null and the request continues
 */
function optionalJwtAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            req.user = null;
            return next();
        }

        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7)
            : authHeader;

        const decoded = verifyToken(token);

        if (decoded.error || !decoded.email) {
            req.user = null;
            return next();
        }

        req.user = {
            id: decoded.id,
            email: decoded.email,
            displayName: decoded.displayName
        };

        const userInMemory = classInformation.users[decoded.email];
        if (userInMemory) {
            req.user.permissions = userInMemory.permissions;
            req.user.classPermissions = userInMemory.classPermissions;
            req.user.activeClass = userInMemory.activeClass;
            req.user.verified = userInMemory.verified;
            req.user.tags = userInMemory.tags;
        }

        next();
    } catch (err) {
        // If anything goes wrong, just continue without user
        req.user = null;
        next();
    }
}

/**
 * Enriches req.user with full user data from database
 * Use this when you need complete user information that might not be in memory
 *
 * @throws {AuthError} If user is not found in database
 */
async function enrichUserFromDatabase(req, res, next) {
    if (!req.user || !req.user.email) {
        throw new AuthError("User not authenticated");
    }

    const userData = await dbGet("SELECT * FROM users WHERE email = ?", [req.user.email]);

    if (!userData) {
        throw new AuthError("User not found in database");
    }

    // Merge database data with existing req.user
    req.user = {
        ...req.user,
        ...userData
    };

    next();
}

module.exports = {
    jwtAuth,
    optionalJwtAuth,
    enrichUserFromDatabase
};

