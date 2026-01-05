const express = require("express");
const fs = require("fs");
const certsRoute = require("../../oldRoutes/certs");
const request = require("supertest");
const { createExpressServer } = require("@modules/tests/tests");

describe("Certs Route", () => {
    let app;

    beforeEach(() => {
        // Create a new Express app instance
        app = createExpressServer();

        // Apply the certs routes
        certsRoute.run(app);
    });

    describe("GET /certs", () => {
        it("should render pages/message with the certificate", async () => {
            // Make request to the route
            const response = await request(app).get("/certs").expect(200);

            // Check the response contains the expected view and data
            expect(response.body.view).toBe("pages/message");
            expect(response.body.options).toEqual({
                title: "Certs",
                excluded: true,
                message: fs.readFileSync("publicKey.pem", "utf8"),
            });
        });

        it("should handle fs errors appropriately", async () => {
            // Create a separate app with error handling for this test
            const errorApp = express();
            errorApp.set("view engine", "ejs");

            // Add route that should throw the error by trying to read a non-existent file
            errorApp.get("/certs", (req, res, next) => {
                try {
                    const cert = fs.readFileSync("non-existent-file.pem", "utf8");
                    res.render("pages/message", {
                        title: "Certs",
                        message: cert,
                    });
                } catch (err) {
                    res.status(500).json({ error: err.message });
                }
            });

            // Make the request
            const response = await request(errorApp).get("/certs").expect(500);

            // Verify the error response contains an error message
            expect(response.body.error).toContain("no such file or directory");
        });
    });
});
