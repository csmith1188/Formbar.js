const { run } = require('../pollCreation');
const { classInformation } = require("../../modules/class/classroom");
const { logger } = require("../../modules/logger");
const { generateColors } = require("../../modules/util");
const { createTestClass, testData, createSocket, createSocketUpdates} = require("../../modules/tests/tests");
const {userSocketUpdates} = require("../init");

jest.mock("../../modules/class/classroom");
jest.mock("../../modules/logger");
jest.mock("../../modules/socketUpdates");
jest.mock("../../modules/util");

describe('startPoll', () => {
    let socket;
    let socketUpdates;
    let startPollHandler;

    beforeEach(() => {
        socket = createSocket();
        socketUpdates = createSocketUpdates();
        userSocketUpdates[socket.request.session.email] = socketUpdates;

        const classData = createTestClass(testData.code, 'Test Class');
        classData.isActive = true;
        classData.students = {}
        classData.poll = {
            responses: {}
        }

        // Run the socket handler
        run(socket, socketUpdates);
        generateColors.mockReturnValue(['#ff0000', '#00ff00', '#0000ff']);
        startPollHandler = socket.on.mock.calls.find(call => call[0] === 'startPoll')[1];
    });

    it('should start a poll successfully', async () => {
        await startPollHandler(3, true, 'Test Poll', [{}, {}, {}], false, 1, ['tag1'], ['box1'], ['indeterminate1'], true);

        // Check if the poll was started successfully
        expect(socketUpdates.clearPoll).toHaveBeenCalled();
        expect(classInformation.classrooms[testData.code].poll.status).toBe(true);
        expect(classInformation.classrooms[testData.code].poll.responses).toEqual({
            a: { answer: 'a', weight: 1, color: '#ff0000' },
            b: { answer: 'b', weight: 1, color: '#00ff00' },
            c: { answer: 'c', weight: 1, color: '#0000ff' }
        });
        expect(socket.emit).toHaveBeenCalledWith('startPoll');
    });

    it('should not start a poll if class is not active', async () => {
        classInformation.classrooms[testData.code].isActive = false;

        // Attempt to start the poll then check if it failed
        await startPollHandler(3, true, 'Test Poll', [{}, {}, {}], false, 1, ['tag1'], ['box1'], ['indeterminate1'], true);
        expect(socket.emit).toHaveBeenCalledWith('message', 'This class is not currently active.');
    });

    it('should handle error during poll start', async () => {
        generateColors.mockImplementation(() => { throw new Error('Test Error'); });

        // Attempt to start the poll then check if the error was logged
        await startPollHandler(3, true, 'Test Poll', [{}, {}, {}], false, 1, ['tag1'], ['box1'], ['indeterminate1'], true);
        expect(logger.log).toHaveBeenCalledWith('error', expect.stringContaining('Test Error'));
    });
});