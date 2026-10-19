const { RateLimiterMemory } = require("rate-limiter-flexible");
const RateLimitError = require("@errors/rate-limit-error");
const { resolveAPIKey } = require("@services/api-key-service");
const { verifyToken } = require("@services/auth-service");

const RATE_LIMIT_DURATION_SECONDS = 15 * 60;
const RATE_LIMIT_MESSAGE = "Too many requests, please try again later.";

/**
 * Normalize an address so IPv4-mapped IPv6 and empty values remain stable keys.
 *
 * @param {*} ipAddress - Client IP address.
 * @returns {string}
 */
function normalizeIpAddress(ipAddress) {
    if (!ipAddress) {
        return "unknown";
    }

    const normalizedIp = String(ipAddress);
    return normalizedIp.startsWith("::ffff:") ? normalizedIp.slice(7) : normalizedIp;
}

/**
 * Determine whether an address is localhost.
 *
 * @param {*} ipAddress - Client IP address.
 * @returns {boolean}
 */
function isLocalhost(ipAddress) {
    const normalizedIp = normalizeIpAddress(ipAddress);
    return normalizedIp === "127.0.0.1" || normalizedIp === "::1" || normalizedIp === "localhost";
}

/**
 * Convert a possible account id to a limiter key.
 *
 * @param {*} userId - Authenticated user id.
 * @returns {string|null}
 */
function getAccountRateLimitKey(userId) {
    if (userId === undefined || userId === null || userId === "") {
        return null;
    }

    return `account:${userId}`;
}

/**
 * Resolve an account key from a bearer authorization header, when present.
 *
 * @param {*} authorizationHeader - Authorization header value.
 * @returns {string|null}
 */
function getAuthorizationRateLimitKey(authorizationHeader) {
    if (typeof authorizationHeader !== "string" || !authorizationHeader.trim()) {
        return null;
    }

    const bearerToken = authorizationHeader.replace(/^Bearer\s+/i, "");
    const decodedToken = verifyToken(bearerToken);
    if (!decodedToken || decodedToken.error) {
        return null;
    }

    return getAccountRateLimitKey(decodedToken.id);
}

/**
 * Resolve an account key from an API key value, when present.
 *
 * @param {*} apiKeyValue - API key from headers or query.
 * @returns {Promise<string|null>}
 */
async function getApiKeyRateLimitKey(apiKeyValue) {
    if (typeof apiKeyValue !== "string" || !apiKeyValue.trim()) {
        return null;
    }

    const apiKeyUser = await resolveAPIKey(apiKeyValue);
    return getAccountRateLimitKey(apiKeyUser?.id);
}

/**
 * Resolve the request limiter key by account first, then by IP fallback.
 *
 * @param {import("express").Request} req - Express request.
 * @returns {Promise<string>}
 */
async function getRequestRateLimitKey(req) {
    const sessionRateLimitKey = getAccountRateLimitKey(req.user?.id);
    if (sessionRateLimitKey) {
        console.log('Session')
        return sessionRateLimitKey;
    }

    const authorizationRateLimitKey = getAuthorizationRateLimitKey(req.headers.authorization);
    if (authorizationRateLimitKey) {
        console.log('Authorization')
        return authorizationRateLimitKey;
    }

    const apiRateLimitKey = await getApiKeyRateLimitKey(typeof req.headers.api === "string" ? req.headers.api : req.query?.api);
    if (apiRateLimitKey) {
        console.log('API')
        return apiRateLimitKey;
    }

    console.log(`ip:${normalizeIpAddress(req.ip)}`)
    return `ip:${normalizeIpAddress(req.ip)}`;
}

/**
 * Resolve the socket limiter key by account first, then by IP fallback.
 *
 * @param {import("socket.io").Socket} socket - Socket connection.
 * @returns {string}
 */
function getSocketRateLimitKey(socket) {
    const sessionRateLimitKey = getAccountRateLimitKey(socket.request?.session?.userId);
    if (sessionRateLimitKey) {
        return sessionRateLimitKey;
    }

    const authorizationRateLimitKey = getAuthorizationRateLimitKey(socket.request?.headers?.authorization);
    if (authorizationRateLimitKey) {
        return authorizationRateLimitKey;
    }

    const socketIpAddress = socket.handshake?.address || socket.request?.socket?.remoteAddress;
    return `ip:${normalizeIpAddress(socketIpAddress)}`;
}

/**
 * Create shared HTTP + socket rate-limit middleware using one in-memory limiter.
 *
 * @param {*} options - Configuration options.
 * @param {number} options.rateLimitMultiplier - Multiplier applied to the base limit.
 * @returns {*}
 */
const { settings, rateLimit: rateLimitConfig } = require("@modules/config.js");

function createRateLimiter(options = {}) {
    const basePoints = Number.isFinite(options.basePoints) ? options.basePoints : (rateLimitConfig?.basePoints ?? 60);
    const durationSeconds = Number.isFinite(options.durationSeconds)
        ? options.durationSeconds
        : (rateLimitConfig?.durationSeconds ?? RATE_LIMIT_DURATION_SECONDS);
    const multiplier = options.rateLimitMultiplier ?? settings?.rateLimitMultiplier ?? 1;

    const points = Math.max(1, Math.round(basePoints * multiplier));

    // Separate in-memory limiters for HTTP and socket traffic so they don't share budgets
    const httpLimiter = new RateLimiterMemory({ points, duration: durationSeconds });
    const socketLimiter = new RateLimiterMemory({ points, duration: durationSeconds });

    return {
        httpMiddleware: async (req, res, next) => {
            if (isLocalhost(req.ip)) {
                next();
                return;
            }

            let rateLimitKey;
            try {
                rateLimitKey = await getRequestRateLimitKey(req);
            } catch (err) {
                next(err);
                return;
            }

            try {
                await httpLimiter.consume(rateLimitKey);
                next();
            } catch (err) {
                next(new RateLimitError(RATE_LIMIT_MESSAGE, { event: "rate-limit.exceeded", reason: "rate_limit_exceeded" }));
            }
        },
        socketMiddleware: (socket, next) => {
            socket.use(async ([event], nextEvent) => {
                try {
                    await socketLimiter.consume(getSocketRateLimitKey(socket));
                    nextEvent();
                } catch (err) {
                    // Emit a user-facing message event (consistent with other socket notifications)
                    socket.emit("message", {
                        message: RATE_LIMIT_MESSAGE,
                        event,
                    });
                }
            });

            next();
        },
    };
}

module.exports = {
    createRateLimiter,
    getRequestRateLimitKey,
    getSocketRateLimitKey,
    normalizeIpAddress,
    getAccountRateLimitKey,
    getAuthorizationRateLimitKey,
    getApiKeyRateLimitKey,
};
