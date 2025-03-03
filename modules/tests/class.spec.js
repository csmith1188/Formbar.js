const { getClassIDFromCode, getClassUsers } = require('../class');

test('Getting class users', async () => {
    // Add test data to the classInformation object
    const code = '123456';
    const username = 'user123';
    classInformation.users[username] = new Student(username, 1, 1, 0, [], [], '', '', false);

    // Mock return values for database.get
    database.all.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT DISTINCT users.id, users.username, users.permissions, CASE WHEN users.id = classroom.owner THEN 5 ELSE classusers.permissions END AS classPermissions FROM users INNER JOIN classusers ON users.id = classusers.studentId OR users.id = classroom.owner INNER JOIN classroom ON classusers.classId = classroom.id WHERE classroom.key = ?')) {
            if (params[0] !== code) {
                // Simulate no class
                callback(null, null);
            } else {
                // Simulate returning users
                callback(null, [{ id: 1, username: 'user123', permissions: 1, classPermissions: 1 }]);
            }
        } else {
            callback(new Error('Unexpected query'));
        }
    });
    
    // @TODO: Finish
});