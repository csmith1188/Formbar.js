const { createSocket, createTestUser, testData, createTestClass } = require("../../modules/tests/tests");
const { run } = require('../break');

describe('break', () => {
    let socket;
    let socketUpdates;
    let requestBreakHandler;
    let approveBreakHandler;
    let endBreakHandler;

    beforeEach(() => {
        socket = createSocket();

        // Run the socket handler
        run(socket, socketUpdates);
        requestBreakHandler = socket.on.mock.calls.find(call => call[0] === 'requestBreak')[1];
        approveBreakHandler = socket.on.mock.calls.find(call => call[0] === 'approveBreak')[1];
        endBreakHandler = socket.on.mock.calls.find(call => call[0] === 'endBreak')[1];
    });

    it("should fail if class isn't active", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        createTestUser(testData.username, testData.code, 3);

        classData.isActive = false;
        await requestBreakHandler("reason");

        expect(classData.students[testData.username].break).toBe(false);
    })

    it("should set the break reason", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        createTestUser(testData.username, testData.code, 3);

        classData.isActive = true;
        await requestBreakHandler("reason");

        expect(classData.students[testData.username].break).toBe("reason");
    })

    it("should approve break ticket", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        const userData = createTestUser(testData.username, testData.code, 3);

        classData.isActive = true;
        classData.students[userData.username].break = "reason";
        await approveBreakHandler(true, userData.username);

        expect(classData.students[testData.username].break).toBe(true);
    });

    it("should deny break ticket", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        const userData = createTestUser(testData.username, testData.code, 3);

        classData.isActive = true;
        classData.students[userData.username].break = "reason";
        await approveBreakHandler(false, userData.username);

        expect(classData.students[testData.username].break).toBe(false);
    })

    it("should delete break ticket", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        const userData = createTestUser(testData.username, testData.code, 3);

        classData.isActive = true;
        classData.students[userData.username].break = "reason";
        await endBreakHandler(userData.username);

        expect(classData.students[testData.username].break).toBe(false);
    })
})