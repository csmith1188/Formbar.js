const { joinClass } = require('../joinClass');
const { database } = require('../database');
const { classInformation } = require('../class');
const { Student } = require('../student');

test('Joining a classroom', async () => {
    // Add test data to the classInformation object
    const code = '123456';
    const username = 'user123';
    const session = { username: 'user123' };
    classInformation.users[username] = new Student(username, 1, 1, 0, [], [], '', '', false);

    // Mock return values for database.get
    database.get.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT * FROM classroom WHERE key=?')) {
            if (params[0] !== code) {
                // Simulate no class found for an invalid code
                callback(null, null);
            } else {
                // Simulate returning a class for the valid code
                callback(null, { id: 1, key: code, name: 'Test', permissions: {}, sharedPolls: [], pollHistory: [], tags: '' });
            }
        } else if (query.includes('SELECT id FROM users WHERE username=?')) {
            // Simulate returning the user
            callback(null, { id: 1, username: username });
        } else if (query.includes('SELECT * FROM classusers')) {
            // Simulate the user not being in the class
            callback(null, null);
        } else {
            callback(new Error('Unexpected query'));
        }
    });
    

    // Mock return values for database.run
    database.run.mockImplementation((query, params, callback) => {
        callback(null);
    });

    let result = await joinClass(code, session);
    expect(result).toBe(true);

    result = await joinClass('wrongCode', session);
    expect(result).toBe('No class with that code');
});
