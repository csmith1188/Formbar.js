const { getClassIDFromCode, getClassUsers, classInformation} = require('../class');
const { Student } = require('../student');
const { database } = require("../database");

// @TODO
// test('Getting class users', async () => {
//     // Add test data to the classInformation object
//     const code = '123456';
//     const username = 'user123';
//     classInformation.users[username] = new Student(username, 1, 1, 0, [], [], '', '', false);
//
//     // Mock return values for database.get
//     database.get.mockImplementation((query, params, callback) => {
//         if (query.includes('SELECT DISTINCT users.id, users.username, users.permissions, CASE WHEN users.id = classroom.owner THEN 5 ELSE classusers.permissions END AS classPermissions FROM users INNER JOIN classusers ON users.id = classusers.studentId OR users.id = classroom.owner INNER JOIN classroom ON classusers.classId = classroom.id WHERE classroom.key = ?')) {
//             if (params[0] !== code) {
//                 // Simulate no class
//                 callback(null, null);
//             } else {
//                 // Simulate returning users
//                 callback(null, [{ id: 1, username: 'user123', permissions: 1, classPermissions: 1 }]);
//             }
//         } else {
//             callback(new Error('Unexpected query'));
//         }
//     });
//
//     const classUsers = getClassUsers()
// });

describe("Get class ID from code", () => {
    test('Class ID found', async () => {
        const key = 'abcd';

        // Mock return values for database.get
        database.get.mockImplementation((query, params, callback) => {
            if (query.includes('SELECT id FROM classroom WHERE key = ?')) {
                if (params[0] !== key) {
                    // Simulate no class found
                    callback(null, null);
                } else {
                    // Simulate returning the class id
                    callback(null, { id: 1 });
                }
            } else {
                callback(new Error('Unexpected query'));
            }
        });

        const classId = await getClassIDFromCode(key);
        expect(classId).toBe(1);
    });

    test('Invalid key provided', async () => {
        const key = 'abcd';

        // Mock return values for database.get
        database.get.mockImplementation((query, params, callback) => {
            if (query.includes('SELECT id FROM classroom WHERE key = ?')) {
                if (params[0] !== key) {
                    // Simulate no class found
                    callback(null, null);
                } else {
                    // Simulate returning the class id
                    callback(null, { id: 1 });
                }
            } else {
                callback(new Error('Unexpected query'));
            }
        });

        const classId = await getClassIDFromCode('invalidkey');
        expect(classId).toBe(null);
    });
});