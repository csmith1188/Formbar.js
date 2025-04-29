const loginRoute = require('../login');
const request = require('supertest');
const {createExpressServer} = require("../../modules/tests/tests");
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Mocks
jest.mock('../../modules/crypto', () => ({
    hash: jest.fn().mockResolvedValue('hashed_password'),
    compare: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../modules/database', () => {
    const dbMock = {
        get: jest.fn(),
        run: jest.fn(),
        all: jest.fn()
    };

    return {
        database: dbMock,
        dbRun: jest.fn().mockResolvedValue(),
        dbGet: jest.fn().mockResolvedValue({token: 'mock_token'})
    };
});

jest.mock('../../modules/student', () => ({
    Student: jest.fn().mockImplementation((username, id, permissions, api, ownedPolls, sharedPolls, tags, displayName, guest) => ({
        username,
        id,
        permissions,
        API: api,
        ownedPolls,
        sharedPolls,
        tags,
        displayName,
        guest
    }))
}));

describe('Login Route', () => {
    let app;
    const {database} = require('../../modules/database');

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Create a new Express app instance
        app = createExpressServer();

        // Add session mock
        app.use((req, res, next) => {
            req.session = {};
            req.protocol = 'http';
            req.get = jest.fn().mockReturnValue('localhost:3000');
            req.ip = '127.0.0.1';
            next();
        });

        // Apply the login route
        loginRoute.run(app);
    });

    describe('GET /login', () => {
        // it('should redirect to home if user is already logged in', async () => {
        //     app.use((req, res, next) => {
        //         req.session.email = 'test@example.com';
        //         next();
        //     });
        //
        //     const response = await request(app)
        //         .get('/login')
        //         .expect(200);
        //
        //     expect(response.headers.location).toBe('/');
        // });

        it('should render login page if user is not logged in', async () => {
            const response = await request(app)
                .get('/login')
                .expect(200);

            expect(response.body.view).toBe('pages/login');
            expect(response.body.options).toEqual({
                title: 'Login',
                redirectURL: undefined,
                route: 'login'
            });
        });

        // it('should handle verification code and create user account', async () => {
        //     // Mock jwt.decode to return a mock user
        //     jest.spyOn(jwt, 'decode').mockReturnValue({
        //         username: 'testuser',
        //         email: 'test@example.com',
        //         hashedPassword: 'hashed_password',
        //         permissions: 'student',
        //         newAPI: 'test_api',
        //         newSecret: 'test_secret',
        //         displayName: 'Test User'
        //     });
        //
        //     database.get.mockImplementation((query, params, callback) => {
        //         callback(null, {
        //             username: 'testuser',
        //             id: 1,
        //             permissions: 'student',
        //             API: 'test_api',
        //             tags: '',
        //             displayName: 'Test User'
        //         });
        //     });
        //
        //     const response = await request(app)
        //         .get('/login?code=test_secret')
        //         .expect(302);
        //
        //     expect(response.headers.location).toBe('/');
        // });
    });

    describe('POST /login', () => {
        it('should log in existing user with correct credentials', async () => {
            database.get.mockImplementation((query, params, callback) => {
                callback(null, {
                    username: 'testuser',
                    id: 1,
                    password: 'hashed_password',
                    permissions: 'student',
                    API: 'test_api',
                    ownedPolls: '[]',
                    sharedPolls: '[]',
                    tags: '',
                    displayName: 'Test User',
                    verified: 1,
                    email: 'test@example.com'
                });
            });

            const response = await request(app)
                .post('/login')
                .send({
                    username: 'testuser',
                    password: 'password',
                    loginType: 'login'
                })
                .expect(200);

            // expect(response.headers.location).toBe('/');
        });

        it('should create a new user account when loginType is new', async () => {
            database.all.mockImplementation((query, callback) => {
                callback(null, []);
            });

            database.get.mockImplementation((query, params, callback) => {
                callback(null, {
                    username: 'newuser',
                    id: 2,
                    permissions: 'manager',
                    API: 'new_api',
                    tags: '',
                    displayName: 'New User',
                    verified: 1,
                    email: 'new@example.com'
                });
            });

            const response = await request(app)
                .post('/login')
                .send({
                    username: 'newuser',
                    password: 'password123',
                    email: 'new@example.com',
                    displayName: 'New User',
                    loginType: 'new'
                })
                .expect(200);

            // expect(response.headers.location).toBe('/');
        });

        it('should create a guest account when loginType is guest', async () => {
            jest.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from('abcd'));

            const response = await request(app)
                .post('/login')
                .send({
                    displayName: 'Guest User',
                    loginType: 'guest'
                })
                .expect(200);

            // expect(response.headers.location).toBe('/');
        });

        it('should handle invalid username for login', async () => {
            database.get.mockImplementation((query, params, callback) => {
                callback(null, {});  // Empty result means no user found
            });

            const response = await request(app)
                .post('/login')
                .send({
                    username: 'nonexistent',
                    password: 'password',
                    loginType: 'login'
                })
                .expect(200);

            expect(response.body.view).toBe('pages/message');
            // expect(response.body.options.message).toBe('No user found with that username.');
        });

        it('should handle incorrect password', async () => {
            const {compare} = require('../../modules/crypto');
            compare.mockResolvedValueOnce(false);

            database.get.mockImplementation((query, params, callback) => {
                callback(null, {
                    username: 'testuser',
                    id: 1,
                    password: 'hashed_password'
                });
            });

            const response = await request(app)
                .post('/login')
                .send({
                    username: 'testuser',
                    password: 'wrongpassword',
                    loginType: 'login'
                })
                .expect(200);

            expect(response.body.view).toBe('pages/message');
            // expect(response.body.options.message).toBe('Incorrect password');
        });

        it('should validate input when creating a new user', async () => {
            const response = await request(app)
                .post('/login')
                .send({
                    username: 'inv', // Too short
                    password: 'pass',
                    email: 'new@example.com',
                    displayName: 'New User',
                    loginType: 'new'
                })
                .expect(200);

            expect(response.body.view).toBe('pages/message');
            // expect(response.body.options.message).toBe('Invalid username, password, or display name. Please try again.');
        });
    });
}); 