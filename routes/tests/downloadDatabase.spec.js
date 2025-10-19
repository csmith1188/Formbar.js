const request = require('supertest');
const downloadDatabaseRoute = require('../downloadDatabase');
const { createExpressServer } = require('../../modules/tests/tests');

// Mock the authentication module to simulate a user being logged in
jest.mock('../middleware/authentication', () => ({
    isAuthenticated: (req, res, next) => next(),
    permCheck: (req, res, next) => next()
}));

describe('Download Database Route', () => {
    let app;

    beforeEach(() => {
        // Create a fresh Express app for each test
        app = createExpressServer();
        
        // Apply the download database route
        downloadDatabaseRoute.run(app);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /downloadDatabase', () => {
        it('should set the correct headers for file download', async () => {
            const response = await request(app)
                .get('/downloadDatabase')
                .expect(200);

            expect(response.body.filePath).toBe('database/database.db');
            expect(response.body.fileName).toBe('database.db');
        });

        it('should handle errors gracefully', async () => {
            const errorApp = createExpressServer();
            
            // Override res.download to throw an error
            errorApp.use((req, res, next) => {
                res.download = function() {
                    throw new Error('Download error');
                };
                next();
            });

            // Apply the route
            downloadDatabaseRoute.run(errorApp);
            
            const response = await request(errorApp)
                .get('/downloadDatabase')
                .expect(200); // Error handler returns 200
            
            // Check that error message is shown
            expect(response.body.options.message).toContain('Error Number');
            expect(response.body.options.title).toBe('Error');
        });
    });
}); 