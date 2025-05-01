const { joinClass } = require('../joinClass');
const { database } = require('../database');
const { testData, createTestUser } = require("./tests");

describe('joinClass', () => {
    const session = { username: testData.username };

    beforeEach(() => {
        createTestUser(testData.username);
        jest.resetAllMocks();

        database.get.mockImplementation((query, params, callback) => {
            if (query.includes('SELECT * FROM classroom WHERE key=?')) {
                // Return class info if the code matches, otherwise return null
                callback(null, params[0] === testData.code ? { id: 1, key: testData.code, name: 'Test', permissions: {}, sharedPolls: [], pollHistory: [], tags: '' } : null);
            } else if (query.includes('SELECT id FROM users WHERE username=?')) {
                // Return user if username matches
                callback(null, params[0] === testData.username ? { id: 1, username: testData.username } : null);
            } else if (query.includes('SELECT * FROM classusers')) {
                // Simulate user not being in the class
                callback(null, null);
            } else {
                callback(new Error('Unexpected query'));
            }
        });

        database.run.mockImplementation((query, params, callback) => {
            callback(null);
        });
    });

    it('should join the class successfully', async () => {
        const result = await joinClass(testData.code, session);
        expect(result).toBe(true);
    });

    it('should return an error for an invalid code', async () => {
        const result = await joinClass('wrongCode', session);
        expect(result).toBe('No class with that code');
    });
})