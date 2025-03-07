const { getClassIDFromCode, getClassUsers, classInformation} = require('../class');
const { database } = require("../database");
const { testData } = require("./testData");

test('Getting class users', async () => {
    database.get.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT id FROM classroom WHERE key = ?')) {
            if (params[0] !== testData.code) {
                // Simulate that the class is not found by returning null
                callback(null, null);
            } else {
                // Simulate that the class is found
                callback(null, { id: 1 });
            }
        }
    });

    database.all.mockImplementation((query, params, callback) => {
        // Check if the query is the one that retrieves users of a class
        if (query.includes('SELECT DISTINCT users.id, users.username, users.permissions, CASE WHEN users.id = classroom.owner THEN 5 ELSE classusers.permissions END AS classPermissions FROM users INNER JOIN classusers ON users.id = classusers.studentId OR users.id = classroom.owner INNER JOIN classroom ON classusers.classId = classroom.id WHERE classroom.key = ?')) {
            if (params[0] !== testData.code) {
                // Simulate that the class does not exist by returning null
                callback(null, null);
            } else {
                // Simulate that users are found in the class
                callback(null, [{ id: 1, username: 'user123', permissions: 1, classPermissions: 1 }]);
            }
        } else {
            callback(new Error('Unexpected query'));
        }
    });

    // Call the function under test
    const classUsers = await getClassUsers(testData.username, testData.code);

    // Check the expected result format, assuming `getClassUsers` returns an object with user details
    expect(classUsers).toStrictEqual({
        user123: {
            loggedIn: false,
            id: 1,
            username: 'user123',
            permissions: 1,
            classPermissions: 1,
            help: null,
            break: null,
            quizScore: null,
            pogMeter: null
        }
    });
});


describe("Get class ID from code", () => {
    beforeEach(() => {
        jest.resetAllMocks();

        database.get.mockImplementation((query, params, callback) => {
            if (query.includes('SELECT id FROM classroom WHERE key = ?')) {
                if (params[0] !== testData.code) {
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
    })

    test('Class ID found', async () => {
        const classId = await getClassIDFromCode(testData.code);
        expect(classId).toBe(1);
    });

    test('Invalid key provided', async () => {
        const classId = await getClassIDFromCode('invalidkey');
        expect(classId).toBe(null);
    });
});