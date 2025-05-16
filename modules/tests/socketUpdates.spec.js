const { classInformation } = require('../class');
const { SocketUpdates } = require('../socketUpdates');
const { createTestUser, createTestClass, testData } = require('./tests');
const { io } = require("../webServer");

describe("Socket Updates", () => {
    let mockEmit;
    let socketUpdates;

    beforeEach(() => {
        jest.resetAllMocks();

        // Mock the socket server to intercept the emit calls
        mockEmit = jest.fn();
        const mockSockets = [
            {
                request: { session: { email: testData.email } },
                rooms: new Set([testData.code]),
                emit: mockEmit,
            }
        ];

        // Hook fetchSockets to return the mock sockets
        io.in = jest.fn().mockReturnValue({
            fetchSockets: async () => mockSockets
        });

        socketUpdates = new SocketUpdates();
        socketUpdates.socket = { request: { session: { classId: testData.code } } };
    });

    describe("virtualBarUpdate", () => {
        it("should handle no active poll", async () => {
            createTestClass(testData.code, 'Test Class');
            createTestUser(testData.email, testData.code, 3);
            await socketUpdates.virtualBarUpdate(testData.code);

            // Check if emit was called with the expected event and data
            expect(mockEmit).toHaveBeenCalledWith("vbUpdate", {
                "status": false,
                "totalResponders": 0,
                "totalResponses": 0,
                "polls": {},
                "textRes": false,
                "prompt": "",
                "weight": 1,
                "blind": false,
                "time": undefined,
                "sound": false,
                "active": false,
                "timePassed": undefined,
            });
        });

        it("should handle active poll with responses", async () => {
            const classData = createTestClass(testData.code, 'Test Class');
            const userData = createTestUser(testData.email, testData.code, 3);

            // Set up the class and user data
            classData.poll.status = true;
            classData.poll.responses = { "option1": { responses: 1 } };
            classData.poll.textRes = true;
            classData.poll.prompt = "Test Prompt";
            classData.poll.weight = 2;
            classData.poll.blind = true;
            classData.poll.requiredTags = [];
            classData.poll.studentBoxes = [userData.email];
            userData.pollRes = { buttonRes: "option1" };
            await socketUpdates.virtualBarUpdate(testData.code);

            // Check if emit was called with the expected event and data
            expect(mockEmit).toHaveBeenCalledWith( "vbUpdate", {
                "status": true,
                "totalResponders": 1,
                "totalResponses": 1,
                "polls": { "option1": { responses: 1 } },
                "textRes": true,
                "prompt": "Test Prompt",
                "weight": 2,
                "blind": true,
                "time": undefined,
                "sound": false,
                "active": false,
                "timePassed": undefined,
            });
        });

        it("should handle students on break", async () => {
            const classData = createTestClass(testData.code, 'Test Class');
            const userData = createTestUser(testData.email, testData.code, 3);

            // Set up the class and user data
            classData.poll.status = true;
            classData.poll.responses = { "option1": { responses: 1 } };
            classData.poll.textRes = true;
            classData.poll.prompt = "Test Prompt";
            classData.poll.weight = 2;
            classData.poll.blind = true;
            classData.poll.requiredTags = [];
            classData.poll.studentBoxes = [userData.email];
            userData.pollRes = { buttonRes: "option1" };
            userData.break = true;

            classInformation.classrooms[testData.code] = classData;
            await socketUpdates.virtualBarUpdate(testData.code);

            // Check if emit was called with the expected event and data
            expect(mockEmit).toHaveBeenCalledWith("vbUpdate", {
                "status": true,
                "totalResponders": 0,
                "totalResponses": 0,
                "polls": { "option1": { responses: 0 } },
                "textRes": true,
                "prompt": "Test Prompt",
                "weight": 2,
                "blind": true,
                "time": undefined,
                "sound": false,
                "active": false,
                "timePassed": undefined,
            });
        });
    });
});
