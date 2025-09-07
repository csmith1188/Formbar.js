const fs = require('fs');
const apiKeyRoute = require('../apiKey');
const request = require('supertest');
const { createExpressServer } = require("../../modules/tests/tests");
const { classInformation } = require("../../modules/class/classroom");

// Mock the authentication module to simulate a user being logged in
jest.mock('../middleware/authentication', () => ({
    isAuthenticated: (req, res, next) => next(),
}));

classInformation.users['testuser'] = { email: 'testuser', API: 'testapikey' };

describe('APIKey Route', () => {
    let app;

    beforeEach(() => {
        // Create a new Express app instance
        app = createExpressServer();
        app.use((req, res, next) => {
            req.session = { email: 'testuser' };
            next();
        });

        // Apply the route
        apiKeyRoute.run(app);
    });

    describe('GET /apikey', () => {
        it('should render proper api key', async () => {
            // Make request to the route
            const response = await request(app)
                .get('/apikey')
                .expect(200);

            expect(response.body.view).toBe('pages/apiKey');
            expect(response.body.options.title).toBe('API Key');
            expect(response.body.options.API).toBe('testapikey');
        });
    });
});