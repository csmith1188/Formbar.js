const { classInformation, Classroom} = require('../class/classroom');
const { Student } = require('../student');
const express = require('express');
const { SocketUpdates } = require("../socketUpdates");

// Common test data
const testData = {
    code: '123456',
    email: 'user123'
}

/**
 * Creates a test user with the given email
 * @param {string} email - The email of the test user
 * @param {string} [classId=null] - The class id to add the user to
 * @param {number} [permissions=5] - The permissions level of the user
 */
function createTestUser(email, classId, permissions = 5) {
    const student = new Student(email, 1, permissions, 0, [], [], [], '', false);
    classInformation.users[email] = student;

    // If a class id is provided, also create the student in the class
    if (classId) {
        student.classPermissions = student.permissions;
        classInformation.classrooms[classId].students[email] = student;
    }
    return student;
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
    return classInformation.classrooms[code];
}

// Creates an express server for testing
function createExpressServer() {
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', './views');

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Middleware to handle responses in tests
    app.use((req, res, next) => {
        res.render = function(view, options) {
            res.status(res.statusCode || 200).json({ view, options });
        };
        res.download = function(filePath, fileName) {
            res.status(200).json({ filePath, fileName })
        }
        next();
    });

    return app;
}

// Mock socket information for simulating socket.io
function createSocket() {
    return {
        on: jest.fn(),
        emit: jest.fn(),
        request: {
            session: {
                classId: testData.code,
                email: testData.email
            }
        },
        handshake: {
            address: '127.0.0.1'
        }
    };
}

// Mock the socket updates
// This is to minimize the number of moving parts that could cause a test to fail
function createSocketUpdates(isMocked = true, socket) {
    if (!socket && isMocked) {
        socket = createSocket(socket);
    }

    return isMocked ? {
        endPoll: jest.fn(),
        clearPoll: jest.fn(),
        classUpdate: jest.fn(),
        customPollUpdate: jest.fn()
    } :  new SocketUpdates(socket);
}

module.exports = {
    testData,
    createTestUser,
    createTestClass,
    createExpressServer,
    createSocket,
    createSocketUpdates
}