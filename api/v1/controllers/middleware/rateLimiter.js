const { getUser } = require("@modules/user/user");
const { verifyToken } = require("../../services/auth-service");
const { TEACHER_PERMISSIONS, GUEST_PERMISSIONS } = require("@modules/permissions");
const { logger } = require("@modules/logger");

const rateLimits = {};

module.exports = (router) => {
    router.use(async (req, res, next) => {
        try {
            if (req.path.startsWith("/auth/")) {
                console.log("Bypassing rate limiter for /auth/ route");
                return next();
            }
            let user = null;
            if (req.headers.api) {
                user = await getUser(req.headers.api);
            } else if (req.headers.authorization) {
                const decodedToken = verifyToken(req.headers.authorization);
                let email = decodedToken.email;
                user = await getUser({email: email});
            } else { // If no auth provided, use ip as identifier with guest permissions
                user = { email: req.ip, permissions: GUEST_PERMISSIONS };
            }


            if (!user.email || !user.permissions) return res.status(401).json({ error: "User is not authenticated" });
            const email = user.email;
            const currentTime = Date.now();
            const timeFrame = 1000; // 1 Second
            const limit = user.permissions >= TEACHER_PERMISSIONS ? 100 : 30;
            if (!rateLimits[email]) {
                rateLimits[email] = {};
            }

            const userRequests = rateLimits[email];
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