jest.mock("@modules/config.js", () => ({
    settings: { rateLimitMultiplier: 1 },
    rateLimit: { basePoints: 60, durationSeconds: 60 },
}));

jest.mock("@services/api-key-service", () => ({
    resolveAPIKey: jest.fn(),
}));

jest.mock("@services/auth-service", () => ({
    verifyToken: jest.fn(),
}));

const RateLimitError = require("@errors/rate-limit-error");
const { resolveAPIKey } = require("@services/api-key-service");
const { verifyToken } = require("@services/auth-service");
const { createRateLimiter, getRequestRateLimitKey, getSocketRateLimitKey, normalizeIpAddress } = require("@middleware/rate-limiter");

afterEach(() => {
    jest.clearAllMocks();
});

function buildRequest(overrides = {}) {
    return {
        user: null,
        session: {},
        headers: {},
        query: {},
        ip: "127.0.0.1",
        ...overrides,
    };
}

function buildResponse() {
    const headers = new Map();

    return {
        getHeader: (name) => headers.get(name),
        setHeader: (name, value) => headers.set(name, value),
    };
}

function buildSocket(overrides = {}) {
    const socket = {
        request: {
            session: {},
            headers: {},
            socket: { remoteAddress: "127.0.0.1" },
        },
        handshake: { address: "127.0.0.1" },
        emit: jest.fn(),
        use: jest.fn((handler) => {
            socket.rateLimitHandler = handler;
        }),
        ...overrides,
    };

    return socket;
}

describe("normalizeIpAddress()", () => {
    it("returns unknown for empty values", () => {
        expect(normalizeIpAddress()).toBe("unknown");
    });

    it("strips IPv4-mapped IPv6 prefixes", () => {
        expect(normalizeIpAddress("::ffff:127.0.0.1")).toBe("127.0.0.1");
    });
});

describe("getRequestRateLimitKey()", () => {
    it("prefers the session user id", async () => {
        const key = await getRequestRateLimitKey(buildRequest({ session: { userId: 123 } }), buildResponse());

        expect(key).toBe("account:123");
    });

    it("creates and reuses an anonymous client header", async () => {
        const firstResponse = buildResponse();
        const firstKey = await getRequestRateLimitKey(buildRequest(), firstResponse);
        const clientId = firstResponse.getHeader("X-Anonymous-Client-Id");
        const secondKey = await getRequestRateLimitKey(
            buildRequest({ headers: { "x-anonymous-client-id": clientId } }),
            buildResponse()
        );

        expect(firstKey).toBe(`anonymous:${clientId}`);
        expect(secondKey).toBe(firstKey);
    });

    it("prefers the session user id", async () => {
        const key = await getRequestRateLimitKey(buildRequest({ user: { id: 123 } }));

        expect(key).toBe("account:123");
    });

    it("falls back to the bearer token when there is no session user", async () => {
        verifyToken.mockReturnValue({ id: 456 });

        const key = await getRequestRateLimitKey(buildRequest({ headers: { authorization: "Bearer token-value" } }));

        expect(verifyToken).toHaveBeenCalledWith("token-value");
        expect(key).toBe("account:456");
    });

    it("falls back to the API key when there is no session or bearer token", async () => {
        resolveAPIKey.mockResolvedValue({ id: 789 });

        const key = await getRequestRateLimitKey(buildRequest({ headers: { api: "api-key-value" } }));

        expect(resolveAPIKey).toHaveBeenCalledWith("api-key-value");
        expect(key).toBe("account:789");
    });

    it("falls back to the request IP", async () => {
        const key = await getRequestRateLimitKey(buildRequest({ ip: "::ffff:127.0.0.1" }));

        expect(key).toBe("ip:127.0.0.1");
    });
});

describe("getSocketRateLimitKey()", () => {
    it("prefers the socket session user id", () => {
        const key = getSocketRateLimitKey(
            buildSocket({
                request: {
                    session: { userId: 321 },
                    headers: {},
                    socket: { remoteAddress: "127.0.0.1" },
                },
            })
        );

        expect(key).toBe("account:321");
    });

    it("falls back to the bearer token when there is no socket session user", () => {
        verifyToken.mockReturnValue({ id: 654 });

        const key = getSocketRateLimitKey(
            buildSocket({
                request: {
                    session: {},
                    headers: { authorization: "Bearer socket-token" },
                    socket: { remoteAddress: "127.0.0.1" },
                },
            })
        );

        expect(verifyToken).toHaveBeenCalledWith("socket-token");
        expect(key).toBe("account:654");
    });

    it("falls back to the socket IP", () => {
        const key = getSocketRateLimitKey(
            buildSocket({
                request: {
                    session: {},
                    headers: {},
                    socket: { remoteAddress: "::ffff:127.0.0.1" },
                },
                handshake: {},
            })
        );

        expect(key).toBe("ip:127.0.0.1");
    });
});

describe("createRateLimiter()", () => {
    it("keeps HTTP and socket budgets separate", async () => {
        const rateLimiter = createRateLimiter({ basePoints: 1, durationSeconds: 60, rateLimitMultiplier: 1 });
        const req = buildRequest({ user: { id: 42 } });
        const socket = buildSocket({
            request: {
                session: { userId: 42 },
                headers: {},
                socket: { remoteAddress: "127.0.0.1" },
            },
        });

        const httpNext = jest.fn();
        const socketNext = jest.fn();

        rateLimiter.socketMiddleware(socket, socketNext);
        expect(socketNext).toHaveBeenCalledTimes(1);

        await rateLimiter.httpMiddleware(req, {}, httpNext);
        expect(httpNext).toHaveBeenCalledTimes(1);

        const socketEventNext = jest.fn();
        await socket.rateLimitHandler(["message"], socketEventNext);

        expect(socketEventNext).toHaveBeenCalledTimes(1);
        expect(socket.emit).not.toHaveBeenCalled();
    });

    it("passes a RateLimitError to next when the HTTP budget is exhausted", async () => {
        const rateLimiter = createRateLimiter({ basePoints: 1, durationSeconds: 60, rateLimitMultiplier: 1 });
        const req = buildRequest({ user: { id: 99 }, ip: "192.0.2.10" });
        const next = jest.fn();

        await rateLimiter.httpMiddleware(req, {}, next);
        await rateLimiter.httpMiddleware(req, {}, next);

        const err = next.mock.calls[next.mock.calls.length - 1][0];

        expect(err).toBeInstanceOf(RateLimitError);
        expect(err.statusCode).toBe(429);
        expect(err.message).toBe("Too many requests, please try again later.");
    });

    it("emits a message event when the socket budget is exhausted", async () => {
        const rateLimiter = createRateLimiter({ basePoints: 1, durationSeconds: 60, rateLimitMultiplier: 1 });
        const socket = buildSocket({
            request: {
                session: { userId: 77 },
                headers: {},
                socket: { remoteAddress: "127.0.0.1" },
            },
        });

        rateLimiter.socketMiddleware(socket, jest.fn());

        await socket.rateLimitHandler(["rate-limit"], jest.fn());
        await socket.rateLimitHandler(["rate-limit"], jest.fn());

        expect(socket.emit).toHaveBeenCalledWith(
            "message",
            expect.objectContaining({
                message: "Too many requests, please try again later.",
                event: "rate-limit",
            })
        );
    });
});
