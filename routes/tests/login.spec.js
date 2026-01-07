const request = require("supertest");
const { createExpressServer, createTestUser } = require("../../modules/tests/tests");
const { database } = require("../../modules/database");
const loginRoute = require("../login");
const crypto = require("crypto");

// Mocks
jest.mock("../../modules/crypto", () => ({
    hash: jest.fn().mockResolvedValue("hashed_password"),
    compare: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../modules/database", () => {
    const dbMock = {
        get: jest.fn((query, params, callback = () => {}) => {
            // Handle the complex user query with polls
            if (query.includes("SELECT users.*, CASE WHEN shared_polls.pollId")) {
                callback(null, {
                    email: params[0], // email is used as email
                    id: 1,
                    password: "hashed_password",
                    permissions: "student",
                    API: "test_api",
                    sharedPolls: "[]",
                    ownedPolls: "[]",
                    tags: "",
                    displayName: "Test User",
                    verified: 1,
                    email: params[0],
                });
            }
        }),
        run: jest.fn((query, params, callback = () => {}) => {
            // Mock successful user insertion
            if (query.includes("INSERT INTO users")) {
                callback(null);
            } else {
                callback(null);
            }
        }),
        all: jest.fn((query, callback = () => {}) => {
            callback(null, []);
        }),
    };

    return {
        database: dbMock,
        dbRun: jest.fn().mockResolvedValue(),
        dbGet: jest.fn().mockResolvedValue({ token: "mock_token" }),
    };
});

jest.mock("../../modules/student", () => ({
    Student: jest.fn().mockImplementation((email, id, permissions, api, ownedPolls, sharedPolls, tags, displayName, guest) => ({
        email,
        id,
        permissions,
        API: api,
        ownedPolls,
        sharedPolls,
        tags,
        displayName,
        guest,
    })),
}));

// Mock settings to disable email verification
jest.mock("../../modules/config", () => ({
    settings: {
        emailEnabled: false,
    },
    logNumbers: {
        error: "MOCK-ERROR-NUMBER",
    },
}));

describe("Login Route", () => {
    let app;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Create a new Express app instance
        app = createExpressServer();

        // Add session mock
        app.use((req, res, next) => {
            req.session = {};
            req.protocol = "http";
            req.get = jest.fn().mockReturnValue("localhost:3000");
            req.ip = "127.0.0.1";
            next();
        });

        // Apply the login route
        loginRoute.run(app);
    });

    describe("GET /login", () => {
        it("should redirect to home if user is already logged in", async () => {
            // Remove session mock to simulate already being logged in
            app = createExpressServer();
            createTestUser("mock_email@mock.com");
            app.use((req, res, next) => {
                req.session = { email: "mock_email@mock.com" };
                next();
            });
            loginRoute.run(app);

            const response = await request(app).get("/login").expect(302);

            expect(response.headers.location).toBe("/");
        });

        it("should render login page if user is not logged in", async () => {
            const response = await request(app).get("/login").expect(200);

            expect(response.body.view).toBe("pages/login");
            expect(response.body.options).toEqual({
                title: "Login",
                redirectURL: undefined,
                route: "login",
            });
        });
    });

    describe("POST /login", () => {
        it("should log in existing user with correct credentials", async () => {
            app = createExpressServer();
            app.use((req, res, next) => {
                req.session = {};
                req.body = {
                    email: "testuser",
                    password: "password",
                    loginType: "login",
                    userType: "?????????????????????",
                    displayName: "Test User",
                    email: "test@example.com",
                };
                next();
            });
            loginRoute.run(app);

            const response = await request(app).post("/login").send();
            // .expect(302);

            expect(response.headers.location).toBe("/");
            expect(database.get).toHaveBeenCalledWith(
                expect.stringContaining("SELECT users.*, CASE WHEN shared_polls.pollId"),
                ["test@example.com"],
                expect.any(Function)
            );
        });

        it("should create a new user account when loginType is new", async () => {
            // Mock database.all to return empty users array (first user will be manager)
            database.all.mockImplementation((query, callback) => {
                callback(null, []);
            });

            // Mock database.get to return the newly created user
            database.get.mockImplementation((query, params, callback = () => {}) => {
                if (query.includes("SELECT users.*, CASE WHEN shared_polls.pollId")) {
                    callback(null, null); // No existing user found
                } else {
                    callback(null, {
                        email: "newuser",
                        id: 2,
                        permissions: "manager",
                        API: "new_api",
                        tags: "",
                        displayName: "New User",
                        verified: 1,
                        email: "new@example.com",
                    });
                }
            });

            const response = await request(app)
                .post("/login")
                .send({
                    email: "newuser",
                    password: "password123",
                    email: "new@example.com",
                    displayName: "New User",
                    loginType: "new",
                })
                .expect(302);

            expect(database.run).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO users"),
                expect.arrayContaining([
                    "new@example.com", // This is due to email being an alias for email now
                    "new@example.com",
                    "hashed_password",
                    expect.any(Number),
                    expect.any(String),
                    expect.any(String),
                    "New User",
                    1,
                ]),
                expect.any(Function)
            );
        });

        it("should create a guest account when loginType is guest", async () => {
            jest.spyOn(crypto, "randomBytes").mockReturnValue(Buffer.from("abcd"));

            const response = await request(app)
                .post("/login")
                .send({
                    displayName: "Guest User",
                    loginType: "guest",
                })
                .expect(302);

            expect(response.headers.location).toBe("/");
        });

        it("should handle incorrect password", async () => {
            const { compare } = require("../../modules/crypto");
            compare.mockResolvedValueOnce(false);

            database.get.mockImplementation((query, params, callback) => {
                if (query.includes("SELECT users.*, CASE WHEN shared_polls.pollId")) {
                    callback(null, {
                        email: "testuser",
                        id: 1,
                        password: "hashed_password",
                        permissions: "student",
                        API: "test_api",
                        sharedPolls: "[]",
                        ownedPolls: "[]",
                        tags: "",
                        displayName: "Test User",
                        verified: 1,
                        email: "test@example.com",
                    });
                } else {
                    callback(null, null);
                }
            });

            const response = await request(app)
                .post("/login")
                .send({
                    email: "testuser",
                    password: "wrongpassword",
                    loginType: "login",
                    email: "test@example.com",
                })
                .expect(200);

            expect(response.body.view).toBe("pages/message");
            expect(response.body.options.message).toBe("Incorrect password");
        });

        it("should validate input when creating a new user", async () => {
            const response = await request(app)
                .post("/login")
                .send({
                    email: "inv", // Too short
                    password: "pass",
                    email: "new@example.com",
                    displayName: "New User",
                    loginType: "new",
                })
                .expect(200);

            expect(response.body.view).toBe("pages/message");
            expect(response.body.options.message).toBe("Invalid password or display name. Please try again.");
        });
    });
});
