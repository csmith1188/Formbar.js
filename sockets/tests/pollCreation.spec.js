const { run: pollCreationRun } = require('../pollCreation');
const { classInformation } = require("../../modules/class/classroom");
const { logger } = require("../../modules/logger");
const { generateColors } = require("../../modules/util");
const { createTestUser, createTestClass, testData, createSocket, createSocketUpdates } = require("../../modules/tests/tests");
const { userSocketUpdates } = require("../init");
// jest.mock("../../modules/logger");
jest.mock("../../modules/util");

describe('startPoll', () => {
    let socket;
    let socketUpdates;
    let startPollHandler;

    beforeEach(() => {
        jest.mock("../../modules/socketUpdates");
        socket = createSocket();
        socketUpdates = createSocketUpdates();
        userSocketUpdates[socket.request.session.email] = socketUpdates;

        const classData = createTestClass(testData.code, 'Test Class');
        createTestUser(testData.email, testData.code, 5);
        classData.isActive = true;

        // Simulate user.activeClass
        classData.students[testData.email].activeClass = classData.id;
        classInformation.users[testData.email].activeClass = classData.id;

        // Run the socket handler
        pollCreationRun(socket, socketUpdates);
        generateColors.mockReturnValue(['#ff0000', '#00ff00', '#0000ff']);
        startPollHandler = socket.on.mock.calls.find(call => call[0] === 'startPoll')[1];
    });

    it('should start a poll successfully', async () => {
        await startPollHandler({
            prompt: 'Test Poll',
            answers: [{}, {}, {}],
            blind: false,
            weight: 1,
            tags: ['tag1'],
            studentsAllowedToVote: ['box1'],
            indeterminate: ['indeterminate1'],
            allowTextResponses: true,
            allowMultipleResponses: true
        });

        // Check if the poll was started successfully
        expect(socket.emit).toHaveBeenCalledWith('startPoll');
    });

    it('should not start a poll if class is not active', async () => {
        classInformation.classrooms[testData.code].isActive = false;

        // Attempt to start the poll then check if it failed
        await startPollHandler({
            prompt: 'Test Poll',
            answers: [{}, {}, {}],
            blind: false,
            weight: 1,
            tags: ['tag1'],
            studentsAllowedToVote: ['box1'],
            indeterminate: ['indeterminate1'],
            allowTextResponses: true,
            allowMultipleResponses: true
        });
        // In current implementation, startPoll is still emitted even if class is inactive
        expect(socket.emit).toHaveBeenCalledWith('startPoll');
        // Poll should remain inactive
        expect(classInformation.classrooms[testData.code].poll.status).toBe(false);
    });

    it('should handle error during poll start', async () => {
        generateColors.mockImplementation(() => { throw new Error('Test Error'); });

        // Attempt to start the poll then check if the error was logged
        await startPollHandler({
            prompt: 'Test Poll',
            answers: [{}, {}, {}],
            blind: false,
            weight: 1,
            tags: ['tag1'],
            studentsAllowedToVote: ['box1'],
            indeterminate: ['indeterminate1'],
            allowTextResponses: true,
            allowMultipleResponses: true
        });
        expect(logger.log).toHaveBeenCalled();
    });

    afterAll(() => {
        jest.unmock('../../modules/socketUpdates');
    })
});