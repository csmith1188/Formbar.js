const { getUser } = require("@modules/user/user");
const { verifyToken } = require("../../services/auth-service");
const { TEACHER_PERMISSIONS, GUEST_PERMISSIONS } = require("@modules/permissions");
const { logger } = require("@modules/logger");

const rateLimits = {};

module.exports = (router) => {
    router.use(async (req, res, next) => {
        try {
            let user = null;
            if (req.headers.api) {
                user = await getUser(req.headers.api);
            } else if (req.headers.authorization) {
                const decodedToken = verifyToken(req.headers.authorization);
                if (!decodedToken || decodedToken.error || !decodedToken.email) {
                    user = { email: req.ip, permissions: GUEST_PERMISSIONS }
                } else {
                    let email = decodedToken.email;
                    user = await getUser({ email: email });
                }
            } else { // If no auth provided, use ip as identifier with guest permissions
                user = { email: req.ip, permissions: GUEST_PERMISSIONS };
            }

            if (!user || user.error ||!user.email || !user.permissions) user = { email: req.ip, permissions: GUEST_PERMISSIONS };
            const identifier = user.email;
            const currentTime = Date.now();
            const timeFrame = 1000; // 1 Second
            let limit = 10; // Default limit for unauthenticated users
            if (user.permissions >= TEACHER_PERMISSIONS) {
                limit = 100; 
            } else if (user.permissions > GUEST_PERMISSIONS) {
                limit = req.path.startsWith("/auth/") ? 10 : 30;
            }
            if (!rateLimits[identifier]) {
                rateLimits[identifier] = {};
            }

            const userRequests = rateLimits[identifier];
            const path = req.path;
            if (!userRequests[path]) {
                userRequests[path] = [];
            }
            while (userRequests[path].length && currentTime - userRequests[path][0] > timeFrame) {
                userRequests[path].shift();
                userRequests["hasBeenMessaged"] = false;
            }

            if (userRequests[path].length >= limit) {
                if (!userRequests["hasBeenMessaged"]) {
                    userRequests["hasBeenMessaged"] = true;
                    return res.status(429).json({ error: `You are being rate limited. Please try again in ${timeFrame / 1000} seconds.` });
                }
                return;
            } else {
                userRequests[path].push(currentTime);
                next();
            }
        } catch (err) {
            logger.log("error", err.stack);
            return res.status(500).json({ error: "There was a server error. Please try again." });
        }
    });
};