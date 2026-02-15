const { getUser } = require("@modules/user/user");
const { verifyToken } = require("@services/auth-service");
const { TEACHER_PERMISSIONS, GUEST_PERMISSIONS } = require("@modules/permissions");

// In-memory rate limit storage
// Structure: { identifier: { path: [timestamps], hasBeenMessaged: bool } }
const rateLimits = {};

async function rateLimiter(req, res, next) {
    let user = null;
    if (req.headers.api) {
        user = await getUser({ api: req.headers.api });
    } else if (req.headers.authorization) {
        const decodedToken = verifyToken(req.headers.authorization);
        if (!decodedToken || decodedToken.error || !decodedToken.email) {
            user = { email: req.ip, permissions: GUEST_PERMISSIONS };
        } else {
            let email = decodedToken.email;
            user = await getUser({ email: email });
        }
    } else {
        // If no auth provided, use ip as identifier with guest permissions
        user = { email: req.ip, permissions: GUEST_PERMISSIONS };
    }

    // Fallback for invalid user data
    if (!user || user.error || !user.email || !user.permissions) {
        user = { email: req.ip, permissions: GUEST_PERMISSIONS };
    }

    const identifier = user.email;
    const currentTime = Date.now();
    const timeFrame = 60000; // 1 minute
    let limit = 10; // Default limit for unauthenticated users
    if (user.permissions >= TEACHER_PERMISSIONS) {
        limit = 225;
    } else if (user.permissions > GUEST_PERMISSIONS) {
        limit = req.path.startsWith("/auth/") ? 10 : 120;
    }

    // Initialize rate limit log for the user if it doesn't exist
    if (!rateLimits[identifier]) {
        rateLimits[identifier] = {};
    }

    // Get the user's request log
    const userRequests = rateLimits[identifier];
    const path = req.path;

    // Initialize request array for this path if it doesn't exist
    if (!userRequests[path]) {
        userRequests[path] = [];
    }

    // Remove timestamps that are outside the time frame
    while (userRequests[path].length && currentTime - userRequests[path][0] > timeFrame) {
        userRequests[path].shift();
        userRequests["hasBeenMessaged"] = false;
    }

    // Check if the user has exceeded the limit
    // If they have, send a rate limit response
    // Otherwise, log the request and proceed
    if (userRequests[path].length >= limit) {
        if (!userRequests["hasBeenMessaged"]) {
            userRequests["hasBeenMessaged"] = true;
            return res.status(429).json({ error: `You are being rate limited. Please try again in ${timeFrame / 1000} seconds.` });
        }
    } else {
        userRequests[path].push(currentTime);
        next();
    }
}

module.exports = {
    rateLimiter,
};
