const { RateLimiterMemory } = require("rate-limiter-flexible");
const crypto = require("crypto");
const RateLimitError = require("@errors/rate-limit-error");
const { resolveAPIKey } = require("@services/api-key-service");
const { verifyToken } = require("@services/auth-service");

const RATE_LIMIT_DURATION_SECONDS = 15 * 60;
const RATE_LIMIT_MESSAGE = "Too many requests, please try again later.";
const ANONYMOUS_CLIENT_HEADER = "x-anonymous-client-id";

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
 * Read a valid anonymous client identifier from a request header.
 * @param {string|undefined} headerValue - Anonymous client header value.
 * @returns {string|null}
 */
function getAnonymousClientHeader(headerValue) {
    return typeof headerValue === "string" && /^[a-f0-9]{32}$/.test(headerValue.trim()) ? headerValue.trim() : null;
}

/**
 * Create and return an anonymous client identifier for rate-limit fairness.
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {string}
 */
function ensureAnonymousClientId(req, res) {
    const existingId = getAnonymousClientHeader(req.headers[ANONYMOUS_CLIENT_HEADER]);
    if (existingId) {
        return existingId;
    }

    const clientId = crypto.randomBytes(16).toString("hex");
    if (typeof res.setHeader === "function") {
        res.setHeader("X-Anonymous-Client-Id", clientId);
        res.setHeader("Access-Control-Expose-Headers", "X-Anonymous-Client-Id");
    }

    return clientId;
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
 * @param {import("express").Response} [res] - Express response used for anonymous headers.
 * @returns {Promise<string>}
 */
async function getRequestRateLimitKey(req, res) {
    const sessionRateLimitKey = getAccountRateLimitKey(req.session?.userId);
    if (sessionRateLimitKey) {
        return sessionRateLimitKey;
    }

    const requestUserKey = getAccountRateLimitKey(req.user?.id);
    if (requestUserKey) {
        return requestUserKey;
    }

    const authorizationRateLimitKey = getAuthorizationRateLimitKey(req.headers.authorization);
    if (authorizationRateLimitKey) {
        return authorizationRateLimitKey;
    }

    const apiRateLimitKey = await getApiKeyRateLimitKey(typeof req.headers.api === "string" ? req.headers.api : req.query?.api);
    if (apiRateLimitKey) {
        return apiRateLimitKey;
    }

    if (res) {
        const anonymousRateLimitKey = `anonymous:${ensureAnonymousClientId(req, res)}`;
        return anonymousRateLimitKey;
    }

    const ipRateLimitKey = `ip:${normalizeIpAddress(req.ip)}`;
    return ipRateLimitKey;
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
    const ipLimiter = new RateLimiterMemory({ points: Math.max(points, points * 10), duration: durationSeconds });
    const socketLimiter = new RateLimiterMemory({ points, duration: durationSeconds });

    return {
        httpMiddleware: async (req, res, next) => {
            if (isLocalhost(req.ip)) {
                next();
                return;
            }

            let rateLimitKey;
            try {
                rateLimitKey = await getRequestRateLimitKey(req, res);
            } catch (err) {
                next(err);
                return;
            }

            try {
                await httpLimiter.consume(rateLimitKey);
                if (rateLimitKey.startsWith("anonymous:")) {
                    await ipLimiter.consume(`ip:${normalizeIpAddress(req.ip)}`);
                }
                next();
            } catch (err) {
                next(new RateLimitError(RATE_LIMIT_MESSAGE, { event: "rate-limit.exceeded", reason: "rate_limit_exceeded" }));
            }
        },
        socketMiddleware: (socket, next) => {
            socket.use(async ([event], nextEvent) => {
                const rateLimitKey = getSocketRateLimitKey(socket);
                try {
                    await socketLimiter.consume(rateLimitKey);
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
