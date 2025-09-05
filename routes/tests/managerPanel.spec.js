const managerRoute = require('../managerPanel');
const request = require('supertest');
const { createExpressServer } = require('../../modules/tests/tests');
const { classInformation } = require('../../modules/class');

describe('Manager Route', () => {
    let app;

    beforeEach(() => {
        // Create a new Express app instance
        app = createExpressServer();

        // Add session mock
        app.use((req, res, next) => {
            req.session = {
                email: 'admin'
            };
            next();
        });

        classInformation.users = {
            admin: {
                email: 'admin',
                permissions: 0
            }
        }

        // Apply the consent route
        managerRoute.run(app);
    });

    describe('GET /managerPanel', () => {
        it('should render manager panel if permissions are met', async () => {
            classInformation.users['admin'].permissions = 5;
            const response = await request(app)
                .get(`/managerPanel`)
                .expect(200);


            expect(response.body.view).toBe('pages/managerPanel');
            expect(response.body.options).toEqual({
                title: 'Manager Panel'
            });
        });

        it ('should return 403 if user does not have permission', async () => {
            const response = await request(app)
                .get(`/managerPanel`);

            expect(response.body.options.message).toContain("You don't have high enough permissions");
        });
    });
});