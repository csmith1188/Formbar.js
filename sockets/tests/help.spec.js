const { createTestClass, testData, createTestUser, createSocket} = require("../../modules/tests/tests")
const { run } = require("../help");

describe("help", () => {
    let socket;
    let socketUpdates;
    let helpHandler;
    let deleteHelpTicketHandler;

    beforeEach(() => {
        socket = createSocket();

        // Run the socket handler
        run(socket, socketUpdates);
        helpHandler = socket.on.mock.calls.find(call => call[0] === 'help')[1];
        deleteHelpTicketHandler = socket.on.mock.calls.find(call => call[0] === 'deleteTicket')[1];
    });

    test("should fail if class isn't active", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        createTestUser(testData.username, testData.code, 3);

        classData.isActive = false;
        await helpHandler("reason");

        expect(classData.students[testData.username].help).toBe(false);
    })

    test("should set the help reason", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        createTestUser(testData.username, testData.code, 3);

        classData.isActive = true;
        await helpHandler("reason");

        expect(classData.students[testData.username].help.reason).toBe("reason");
    })

    test("should delete help ticket", async () => {
        const classData = createTestClass(testData.code, 'Test Class');
        const userData = createTestUser(testData.username, testData.code, 3);

        classData.isActive = true;
        classData.students[userData.username].help = {
            reason: "reason",
            time: new Date()
        }
        await deleteHelpTicketHandler(userData.username);

        expect(classData.students[testData.username].help).toBe(false);
    })
})