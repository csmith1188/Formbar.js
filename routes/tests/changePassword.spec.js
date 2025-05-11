const changePasswordRoute = require("../changePassword");
const request = require('supertest');
const { createExpressServer } = require("../../modules/tests/tests");
const { database } = require("../../modules/database");
const { sendMail } = require("../../modules/mail");

jest.mock('../../modules/mail', () => ({
    sendMail: jest.fn()
}));

jest.mock('../../modules/crypto', () => ({
    hash: jest.fn().mockResolvedValue('hashed-password')
}));

describe("Change Password Route", () => {
    const mockEmail = 'test@example.com';
    const mockSecret = 'valid-secret';
    let app;

    beforeEach(() => {
        app = createExpressServer();

        database.get.mockImplementation((query, callback) => {
            callback(null, { secret: mockSecret });
        });
        
        // Add session mock
        app.use((req, res, next) => {
            req.session = {
                username: "testuser",
                email: mockEmail
            };
            next();
        });

        // Apply the change password route
        changePasswordRoute.run(app);
    });

    describe('GET /changepassword', () => {
        it('should render change password page when no code is provided', async () => {
            const response = await request(app)
                .get('/changepassword')
                .expect(200);

            expect(response.body.view).toBe('pages/changepassword');
            expect(response.body.options).toEqual({
                sent: false,
                title: 'Change Password'
            });
        });

        it('should render change password page with sent=true when valid code is provided', async () => {
            const response = await request(app)
                .get(`/changepassword?code=${mockSecret}&email=${mockEmail}`)
                .expect(200);

            expect(response.body.view).toBe('pages/changepassword');
            expect(response.body.options).toEqual({
                sent: true,
                title: 'Change Password'
            });
        });

        it('should render error page when invalid code is provided', async () => {
            const response = await request(app)
                .get(`/changepassword?code=invalid-secret&email=${mockEmail}`)
                .expect(200);

            expect(response.body.view).toBe('pages/message');
            expect(response.body.options).toEqual({
                message: 'Invalid code',
                title: 'Error'
            });
        });

        it('should handle database errors gracefully', async () => {
            // Mock database.get to throw an error
            require('../../modules/database').database.get.mockImplementation((query, callback) => {
                callback(new Error('Database error'));
            });

            const response = await request(app)
                .get(`/changepassword?code=${mockSecret}&email=${mockEmail}`)
                .expect(200);

            expect(response.body.view).toBe('pages/message');
            expect(response.body.options.message).toContain('Error Number');
            expect(response.body.options.title).toBe('Error');
        });
    });

    describe('POST /changepassword', () => {
        it('should send password reset email when email is provided', async () => {
            const response = await request(app)
                .post('/changepassword')
                .send({ email: mockEmail })
                .expect(302);

            expect(sendMail).toHaveBeenCalledWith(
                mockEmail,
                'Formbar Password Change',
                expect.stringContaining(mockSecret)
            );
        });

        it('should return error when passwords do not match', async () => {
            const response = await request(app)
                .post('/changepassword')
                .send({
                    newPassword: 'password1',
                    confirmPassword: 'password2'
                })
                .expect(200);

            expect(response.body.view).toBe('pages/message');
            expect(response.body.options).toEqual({
                message: 'Passwords do not match',
                title: 'Error'
            });
        });
        //
        // it('should update password when valid session and matching passwords', async () => {
        //     const mockEmail = 'test@example.com';
        //     const mockPassword = 'new-password';
        //
        //     // Mock database.run to succeed
        //     require('../../modules/database').database.run.mockImplementation((query, params, callback) => {
        //         callback(null);
        //     });
        //
        //     const response = await request(app)
        //         .post('/changepassword')
        //         .set('Cookie', ['connect.sid=test-session'])
        //         .send({
        //             newPassword: mockPassword,
        //             confirmPassword: mockPassword
        //         })
        //         .expect(302);
        //
        //     expect(require('../modules/database').database.run).toHaveBeenCalledWith(
        //         'UPDATE users SET password = ? WHERE email = ?',
        //         ['hashed-password', mockEmail],
        //         expect.any(Function)
        //     );
        // });
        //
        // it('should handle database errors during password update', async () => {
        //     // Mock database.get to return a secret
        //     require('../../modules/database').database.get.mockImplementation((query, callback) => {
        //         callback(null, { secret: 'any-secret' });
        //     });
        //
        //     // Mock database.run to throw an error
        //     require('../../modules/database').database.run.mockImplementation((query, params, callback) => {
        //         callback(new Error('Database error'));
        //     });
        //
        //     const response = await request(app)
        //         .post('/changepassword')
        //         .set('Cookie', ['connect.sid=test-session'])
        //         .send({
        //             newPassword: 'new-password',
        //             confirmPassword: 'new-password'
        //         })
        //         .expect(200);
        //
        //     expect(response.body.view).toBe('pages/message');
        //     expect(response.body.options.message).toContain('MOCK-ERROR-NUMBER');
        //     expect(response.body.options.title).toBe('Error');
        // });
    });
});