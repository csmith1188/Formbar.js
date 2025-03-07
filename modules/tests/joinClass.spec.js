// Replace calls to the database
jest.mock('../database');

const { joinClass } = require('../joinClass');
const { database } = require('../database');
const { classInformation } = require('../class');
const { Student } = require('../student');

function mockDatabaseQueries(validCode, validUsername) {
    database.get.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT * FROM classroom WHERE key=?')) {
            // Return class info if the code matches, otherwise return null
            callback(null, params[0] === validCode ?
                { id: 1, key: validCode, name: 'Test', permissions: {}, sharedPolls: [], pollHistory: [], tags: '' }
                : null);
        } else if (query.includes('SELECT id FROM users WHERE username=?')) {
            // Return user if username matches
            callback(null, params[0] === validUsername ? { id: 1, username: validUsername } : null);
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
}

function setupTestData(username) {
    classInformation.users[username] = new Student(username, 1, 1, 0, [], [], '', '', false);
}

describe('Joining a classroom', () => {
    const validCode = '123456';
    const username = 'user123';
    const session = { username };

    beforeEach(() => {
        setupTestData(username);
        mockDatabaseQueries(validCode, username);
    });

    test('Success', async () => {
        const result = await joinClass(validCode, session);
        expect(result).toBe(true);
    });

    test('Invalid code', async () => {
        const result = await joinClass('wrongCode', session);
        expect(result).toBe('No class with that code');
    });
})