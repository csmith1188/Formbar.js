const { logger } = require("@modules/logger");
const { classInformation } = require("@modules/class/classroom");
const { logNumbers, settings } = require("@modules/config");
const { PAGE_PERMISSIONS, GUEST_PERMISSIONS } = require("@modules/permissions");
const { dbGetAll, dbRun } = require("@modules/database");
const { verifyToken } = require("../../services/auth-service");

const whitelistedIps = {};
const blacklistedIps = {};
const loginOnlyRoutes = ["/createClass", "/selectClass", "/managerPanel", "/downloadDatabase", "/logs", "/apikey"]; // Routes that can be accessed without being in a class

// Removes expired refresh tokens from the database
async function cleanRefreshTokens() {
    try {
        const refreshTokens = await dbGetAll("SELECT * FROM refresh_tokens");
        for (const refreshToken of refreshTokens) {
            if (Date.now() >= refreshToken.exp) {
                await dbRun("DELETE FROM refresh_tokens WHERE refresh_token = ?", [refreshToken.refresh_token]);
            }
        }
    } catch (err) {
        logger.log("error", err.stack);
    }
}

/*
Check if user has logged in
Place at the start of any page that needs to verify if a user is logged in or not
This allows websites to check on their own if the user is logged in
This also allows for the website to check for permissions
*/
function isAuthenticated(req, res, next) {
    try {
        const accessToken = req.headers.authorization;
        if (!accessToken) {
            return res.status(401).json({ error: "User is not authenticated" });
        }

        // @todo: cleanup
        // logger.log("info", `[isAuthenticated] url=(${req.url}) ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

        const decodedToken = verifyToken(accessToken);
        if (decodedToken.error) {
            return res.status(401).json({ error: "Invalid access token provided." });
        }

        const email = decodedToken.email;
        if (!email) {
            return res.status(401).json({ error: "Invalid access token provided. Missing 'email'." });
        }

        const user = classInformation.users[email];
        if (!user) {
            return res.status(401).json({ error: "Invalid access token or api key provided." });
        }

        req.session.email = email;
        req.session.user = user;
        req.session.userId = user.id;
        req.session.displayName = user.displayName;
        req.session.verified = user.verified;
        req.session.tags = user.tags;

        // Allow access to certain routes without being in a class
        if (loginOnlyRoutes.includes(req.url)) {
            next();
            return;
        }

        // If the user is not in a class, then continue
        const isInClass = user.activeClass != null;
        if (isInClass) {
            next();
            return;
        }

        next();
    } catch (err) {
        logger.log("error", err.stack);
        res.status(500).json({ error: "There was a server error. Please try again." });
    }
}

// Create a function to check if the user's email is verified
function isVerified(req, res, next) {
    try {
        const accessToken = req.headers.authorization;
        if (!accessToken) {
            return res.status(401).json({ error: "User is not authenticated." });
        }

        // Log that the function is being called with the ip and the session of the user
        logger.log("info", `[isVerified] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
        if (req.session.email) {
            // If the user is verified or email functionality is disabled...
            if (req.session.verified || !settings.emailEnabled || classInformation.users[req.session.email].permissions == GUEST_PERMISSIONS) {
                next();
            } else {
                // Redirect to the login page
                // @todo: no more redirect
                res.redirect("/login");
            }
        } else {
            // If there is no session, redirect to the login page
            // @todo: no more redirect
            res.redirect("/login");
        }
    } catch (err) {
        logger.log("error", err.stack);
        res.status(500).json({ error: "There was a server error. Please try again." });
    }
}

// Check if user has the permission levels to enter that page
function permCheck(req, res, next) {
    try {
        const email = req.session.email;

        logger.log("info", `[permCheck] ip=(${req.ip}) session=(${JSON.stringify(req.session)}) url=(${req.url})`);

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

            if (!classInformation.users[email]) {
                req.session.classId = null;
            }

            // Ensure the url path is all lowercase
            urlPath = urlPath.toLowerCase();

            logger.log("verbose", `[permCheck] urlPath=(${urlPath})`);
            if (!PAGE_PERMISSIONS[urlPath]) {
                logger.log("info", `[permCheck] ${urlPath} is not in the page permissions`);
                res.status(404).json({ error: `${urlPath} is not in the page permissions` });
                return;
            }

            // Checks if users permissions are high enough
            if (PAGE_PERMISSIONS[urlPath].classPage && classInformation.users[email].classPermissions >= PAGE_PERMISSIONS[urlPath].permissions) {
                next();
            } else if (!PAGE_PERMISSIONS[urlPath].classPage && classInformation.users[email].permissions >= PAGE_PERMISSIONS[urlPath].permissions) {
                next();
            } else {
                logger.log("info", "[permCheck] Not enough permissions");
                res.status(403).json({ error: "You do not have permissions to access this page." });
            }
        }
    } catch (err) {
        logger.log("error", err.stack);
        res.status(500).json({ error: "There was a server error. Please try again." });
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
