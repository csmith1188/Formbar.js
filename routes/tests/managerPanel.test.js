const managerRoute = require('../managerPanel');
const request = require('supertest');
const { createExpressServer } = require("../../modules/tests/tests");

describe('Manager Route', () => {
    let app;

    beforeEach(() => {
        // Create a new Express app instance
        app = createExpressServer();

        // Add session mock
        app.use((req, res, next) => {
            req.session = {};
            next();
        });

        // Apply the consent route
        managerRoute.run(app);
    });

    describe('GET /managerPanel', () => {
        it('should render manager panel if permissions are met', async () => {

            const response = await request(app)
                .get(`/managerPanel`)
                .expect(302);


            console.log(response.body)
            // expect(response.body.view).toBe('pages/managerPanel');
            // expect(response.body.options).toEqual({
            //     title: 'Manager Panel'
            // });
        });

        // it ("should return 403 if user does not have permission", async () => {
        //     jest.unmock('../../modules/authentication');
        //     // Mock the authentication module to simulate a user being logged in
        //     const response = await request(app)
        //         .get(`/managerPanel`)
        //         .expect(302);
        // });
    });
});