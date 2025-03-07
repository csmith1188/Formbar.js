const { classInformation, Classroom} = require("../class");
const { Student } = require("../student");

// Common test data
const testData = {
    code: '123456',
    username: 'user123'
}

/**
 * Creates a test user with the given username
 * @param {string} username - The username of the test user
 * @param {string} [classId=null] - The class id to add the user to
 */
function createTestUser(username, classId) {
    const student = new Student(username, 1, 1, 0, [], [], '', '', false);;
    classInformation.users[username] = student;

    // If a class id is provided, also create the student in the class
    if (classId) {
        classInformation.classrooms[classId].students[username] = student;
    }
}

/**
 * Creates a test class with the given code and name
 * The class id will be the same as the code provided
 * @param {string} code - The code of the test class
 * @param {string} name - The name of the test class
 */
function createTestClass(code, name) {
    classInformation.classrooms[code] = new Classroom(
        code,
        name,
        code,
        1,
        [],
        [],
        []
    );
}

module.exports = {
    testData,
    createTestUser,
    createTestClass
}