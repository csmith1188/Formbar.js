const { classInformation } = require("../class/classroom");
const { SocketUpdates } = require("../socket-updates");
const { createTestUser, createTestClass, testData } = require("./tests");
const { io } = require("../web-server");

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
            },
        ];

        // Hook fetchSockets to return the mock sockets
        io.in = jest.fn().mockReturnValue({
            fetchSockets: async () => mockSockets,
        });

        socketUpdates = new SocketUpdates();
        socketUpdates.socket = { request: { session: { classId: testData.code, email: testData.email } } };
        socketUpdates.customPollUpdate = jest.fn();
    });

    describe("classUpdate", () => {
        it("emits classUpdate with server-computed poll totals", async () => {
            const { createTestClass, createTestUser } = require("./tests");
            const { DEFAULT_CLASS_PERMISSIONS, TEACHER_PERMISSIONS, STUDENT_PERMISSIONS } = require("../permissions");
            const { classInformation } = require("../class/classroom");

            // Setup classroom and permissions
            const classData = createTestClass(testData.code, "Test Class");
            classData.permissions = DEFAULT_CLASS_PERMISSIONS;

            // Teacher (will receive the emit)
            const teacher = createTestUser(testData.email, testData.code, TEACHER_PERMISSIONS);
            teacher.classPermissions = TEACHER_PERMISSIONS;

            // Student who is allowed to vote and has responded
            const studentEmail = "student@example.com";
            const student = createTestUser(studentEmail, testData.code, STUDENT_PERMISSIONS);
            student.classPermissions = STUDENT_PERMISSIONS;
            student.pollRes.buttonRes = "A";

            // Active poll with one valid response
            classData.poll.status = true;
            classData.poll.responses = [{ answer: "A", weight: 1, color: "#000" }];
            classData.poll.studentsAllowedToVote = [student.id];

            // Execute
            await socketUpdates.classUpdate(testData.code);

            // Assert emit with computed totals
            expect(mockEmit).toHaveBeenCalled();
            const calls = mockEmit.mock.calls.filter((call) => call[0] === "classUpdate");
            expect(calls.length).toBeGreaterThan(0);

            const payload = calls[calls.length - 1][1];
            expect(payload.poll.totalResponses).toBe(1);
            expect(payload.poll.totalResponders).toBe(1);
            // Teachers should receive full poll data
            expect(Array.isArray(payload.excludedRespondents)).toBe(true);
        });
    });
});
