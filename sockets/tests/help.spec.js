const { createTestClass, testData, createTestUser, createSocket } = require("../../modules/tests/tests")
const { run: helpRun } = require("../help");

describe("help", () => {
    let socket;
    let socketUpdates;
    let helpHandler;
    let deleteHelpTicketHandler;

    beforeEach(() => {
        socket = createSocket();

        // Run the socket handler
        helpRun(socket, socketUpdates);
        helpHandler = socket.on.mock.calls.find(call => call[0] === 'help')[1];
        deleteHelpTicketHandler = socket.on.mock.calls.find(call => call[0] === 'deleteTicket')[1];
    });

    it("should fail if class isn't active", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        createTestUser(testData.email, testData.code, 3);

        classData.isActive = false;
        await helpHandler("reason");

        expect(classData.students[testData.email].help).toBe(false);
    })

    it("should set the help reason", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        createTestUser(testData.email, testData.code, 3);

        classData.isActive = true;
        await helpHandler("reason");

        expect(classData.students[testData.email].help.reason).toBe("reason");
    })

    it("should delete help ticket", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        const userData = createTestUser(testData.email, testData.code, 3);

        classData.isActive = true;
        classData.students[userData.email].help = {
            reason: "reason",
            time: Date.now()
        }
        await deleteHelpTicketHandler(userData.email);

        expect(classData.students[testData.email].help).toBe(false);
    })
})