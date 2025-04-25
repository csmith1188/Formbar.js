const notFoundRoute = require('../404');
const request = require('supertest');
const { createExpressServer } = require("../../modules/tests/tests");

describe('404 Routes', () => {
    let app;

    beforeEach(() => {
        // Create a new Express app instance
        app = createExpressServer();
        
        // Add a simple route that should work
        app.get('/valid-route', (req, res) => {
            res.send('This is a valid route');
        });
        
        // Apply the 404 route handler (should be last)
        notFoundRoute.run(app);
    });

    describe('Standard 404 responses', () => {
        it('should return 404 with correct message for non-existent routes', async () => {
            // Request a non-existent route
            const response = await request(app)
                .get('/non-existent-route')
                .expect(404);
            
            // Check that the response renders the correct view with the right data
            expect(response.body.view).toBe('pages/message');
            expect(response.body.options).toEqual({
                message: 'Error: the page non-existent-route does not exist',
                title: 'Error'
            });
        });

        it('should return 404 for non-existent nested routes', async () => {
            const response = await request(app)
                .get('/nested/non-existent/route')
                .expect(404);
            
            expect(response.body.view).toBe('pages/message');
            expect(response.body.options.message).toContain('nested/non-existent/route');
            expect(response.body.options.title).toBe('Error');
        });
    });
}); 