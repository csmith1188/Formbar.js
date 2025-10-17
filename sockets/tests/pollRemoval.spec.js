const { run: pollCreationRun } = require('../polls/pollCreation');
const { run: pollRemovalRun } = require('../polls/pollRemoval');
const { createTestClass, testData, createSocket, createSocketUpdates } = require("../../modules/tests/tests");
const { userSocketUpdates } = require("../init");

jest.mock("../../modules/class/classroom");
// jest.mock("../../modules/logger");
jest.mock('../../modules/socketUpdates')
jest.mock("../../modules/util");

describe('endPoll', () => {
    let socket;
    let socketUpdates;
    let startPollHandler;
    let endPollHandler;
    let classData;

    beforeEach(async () => {
        socket = createSocket();
        socketUpdates = createSocketUpdates(true);
        userSocketUpdates[socket.request.session.email] = socketUpdates;

        classData = createTestClass(testData.code, 'Test Class');
        classData.isActive = true;
        classData.students = {}
        classData.poll = {
            responses: {}
        }

        // Run the socket handler
        pollCreationRun(socket, socketUpdates);
        pollRemovalRun(socket, socketUpdates);
        startPollHandler = socket.on.mock.calls.find(call => call[0] === 'startPoll')[1];
        endPollHandler = socket.on.mock.calls.find(call => call[0] === 'endPoll')[1];
    });

    it('should end a poll successfully', async () => {
        await startPollHandler(3, true, 'Test Poll', [{}, {}, {}], false, 1, ['tag1'], ['box1'], ['indeterminate1'], true);
        await endPollHandler();

        // Check if the poll was ended successfully
        // expect(socketUpdates.pollUpdate).toBeCalled();
        // expect(socketUpdates.controlPanelUpdate).toBeCalled();
    });
});