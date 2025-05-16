const studentRoute = require('../student');
const request = require('supertest');
const { createExpressServer } = require('../../modules/tests/tests');
const { classInformation } = require('../../modules/class');
const { STUDENT_PERMISSIONS, GUEST_PERMISSIONS } = require('../../modules/permissions');

describe('Student Route', () => {
    let app;
    const mockemail = 'testuser';
    const mockClassId = 'testclass123';

    beforeEach(() => {
        // Create a new Express app instance
        app = createExpressServer();

        // Add session mock
        app.use((req, res, next) => {
            req.session = {
                email: mockemail,
                classId: mockClassId,
                tags: []
            };
            req.query = {};
            next();
        });

        // Initialize classInformation with test user and class
        classInformation.users = {
            [mockemail]: {
                email: mockemail,
                permissions: STUDENT_PERMISSIONS,
                activeClasses: [mockClassId],
                classPermissions: GUEST_PERMISSIONS
            }
        };

        classInformation.classrooms = {
            [mockClassId]: {
                students: {
                    [mockemail]: {
                        email: mockemail,
                        permissions: STUDENT_PERMISSIONS,
                        classPermissions: GUEST_PERMISSIONS,
                        pollRes: {
                            buttonRes: null,
                            textRes: null
                        }
                    }
                },
                lesson: {
                    title: 'Test Lesson'
                }
            }
        };

        // Apply the student route
        studentRoute.run(app);
    });

    describe('GET /student', () => {
        it('should render student page with user information', async () => {
            const response = await request(app)
                .get('/student')
                .expect(200);

            expect(response.body.view).toBe('pages/student');
            expect(response.body.options.title).toBe('Student');
            expect(response.body.options.user).toBeDefined();
            expect(response.body.options.myRes).toBeNull();
            expect(response.body.options.myTextRes).toBeNull();
        });

        it('should redirect to login when user is not logged in', async () => {
            // Remove session mock to simulate not logged in
            app = createExpressServer();
            app.use((req, res, next) => {
                req.session = {};
                next();
            });
            studentRoute.run(app);

            const response = await request(app)
                .get('/student')
                .expect(302);

            expect(response.headers.location).toBe('/login');
        });
    });
});