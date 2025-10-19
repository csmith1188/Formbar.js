const { createSocket, createTestUser, testData, createTestClass, createSocketUpdates } = require("../../modules/tests/tests");
const { run: breakRun } = require('../break');

describe('break', () => {
    let socket;
    let socketUpdates;
    let requestBreakHandler;
    let approveBreakHandler;
    let endBreakHandler;

    beforeEach(() => {
        socket = createSocket();
        socketUpdates = createSocketUpdates();

        // Run the socket handler
        breakRun(socket, socketUpdates);
        requestBreakHandler = socket.on.mock.calls.find(call => call[0] === 'requestBreak')[1];
        approveBreakHandler = socket.on.mock.calls.find(call => call[0] === 'approveBreak')[1];
        endBreakHandler = socket.on.mock.calls.find(call => call[0] === 'endBreak')[1];
    });

    it("should fail if class isn't active", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        createTestUser(testData.email, testData.code, 3);

        classData.isActive = false;
        await requestBreakHandler("reason");

        expect(classData.students[testData.email].break).toBe(false);
    })

    it("should set the break reason", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        createTestUser(testData.email, testData.code, 3);

        classData.isActive = true;
        await requestBreakHandler("reason");

        expect(classData.students[testData.email].break).toBe("reason");
    })

    it("should approve break ticket", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        const userData = createTestUser(testData.email, testData.code, 3);

        classData.isActive = true;
        classData.students[userData.email].break = "reason";
        await approveBreakHandler(true, userData.id);

        expect(classData.students[testData.email].break).toBe(true);
    });

    it("should deny break ticket", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        const userData = createTestUser(testData.email, testData.code, 3);

        classData.isActive = true;
        classData.students[userData.email].break = "reason";
        await approveBreakHandler(false, userData.id);

        expect(classData.students[testData.email].break).toBe(false);
    })

    it("should delete break ticket", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        const userData = createTestUser(testData.email, testData.code, 3);

        classData.isActive = true;
        classData.students[userData.email].break = "reason";
        await endBreakHandler();

        expect(classData.students[testData.email].break).toBe(false);
    })
})