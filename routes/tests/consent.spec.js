const consentRoute = require("../consent");
const request = require("supertest");
const { createExpressServer } = require("@modules/tests/tests");
const jwt = require("jsonwebtoken");

describe("Consent Route", () => {
    let app;
    const secretKey = "your-secret-key"; // Must match the key in consent.js

    beforeEach(() => {
        // Create a new Express app instance
        app = createExpressServer();

        // Add session mock
        app.use((req, res, next) => {
            req.session = {};
            next();
        });

        // Apply the consent route
        consentRoute.run(app);
    });

    describe("GET /consent", () => {
        it("should render consent page with correct data when valid token is provided", async () => {
            // Create a valid token
            const userData = {
                name: "Test User",
                digipogs: 100,
            };

            const token = jwt.sign(userData, secretKey);
            const response = await request(app).get(`/consent?token=${token}`).expect(200);

            // Check that the correct view is rendered with the right data
            expect(response.body.view).toBe("pages/consent");
            expect(response.body.options).toEqual({
                title: "Consent",
                name: "Test User",
                digipogs: 100,
            });
        });

        it("should return 400 when no token is provided", async () => {
            const response = await request(app).get("/consent").expect(400);

            expect(response.text).toBe("Token is required");
        });

        it("should return 401 when an invalid token is provided", async () => {
            const response = await request(app).get("/consent?token=invalid-token").expect(401);

            expect(response.text).toBe("Invalid token");
        });

        it("should handle errors gracefully", async () => {
            // Create an app that throws an error
            const errorApp = createExpressServer();

            // Override jwt.verify to throw an error
            const originalVerify = jwt.verify;
            jwt.verify = jest.fn().mockImplementation(() => {
                throw new Error("Unexpected error");
            });

            // Apply the consent route
            consentRoute.run(errorApp);

            const response = await request(errorApp).get("/consent?token=some-token").expect(200);

            // Check that the error message is displayed
            expect(response.body.options.message).toContain("Error Number");
            expect(response.body.options.title).toBe("Error");

            // Restore the original jwt.verify
            jwt.verify = originalVerify;
        });
    });
});
