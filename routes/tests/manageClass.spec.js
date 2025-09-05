const manageClassRoute = require('../manageClass');
const request = require('supertest');
const { createExpressServer } = require('../../modules/tests/tests');
const { classInformation } = require('../../modules/class/classroom');
const { TEACHER_PERMISSIONS, STUDENT_PERMISSIONS } = require('../../modules/permissions');

describe('Manage Class Route', () => {
    let app;
    const mockemail = 'testuser';

    beforeEach(() => {
        app = createExpressServer();

        // Add session mock
        app.use((req, res, next) => {
            req.session = {
                email: mockemail
            };
            next();
        });

        // Initialize classInformation with test user
        classInformation.users = {
            [mockemail]: {
                email: mockemail,
                permissions: TEACHER_PERMISSIONS,
                activeClass: null
            }
        };

        // Apply the manage class route
        manageClassRoute.run(app);
    });

    describe('GET /manageClass', () => {
        it('should render manage class page when user has teacher permissions', async () => {
            const response = await request(app)
                .get('/manageClass')
                .expect(200);

            expect(response.body.view).toBe('pages/manageClass');
            expect(response.body.options).toEqual({
                title: 'Create Class'
            });
        });

        it('should return error when user does not have teacher permissions', async () => {
            // Set user permissions to student level
            classInformation.users[mockemail].permissions = STUDENT_PERMISSIONS;

            const response = await request(app)
                .get('/manageClass')
                .expect(200);

            expect(response.body.view).toBe('pages/message');
            expect(response.body.options.message).toContain("You don't have high enough permissions");
            expect(response.body.options.title).toBe('Error');
        });

        it('should redirect to login when user is not logged in', async () => {
            // Remove session mock to simulate not logged in
            app = createExpressServer();
            app.use((req, res, next) => {
                req.session = {};
                next();
            });
            manageClassRoute.run(app);

            const response = await request(app)
                .get('/manageClass')
                .expect(302);

            expect(response.headers.location).toBe('/login');
        });

        it('should handle server errors gracefully', async () => {
            classInformation.users = null; // Force an error

            const response = await request(app)
                .get('/manageClass')
                .expect(200);

            expect(response.body.view).toBe('pages/message');
            expect(response.body.options.message).toContain('Error Number');
            expect(response.body.options.title).toBe('Error');
        });
    });
}); 