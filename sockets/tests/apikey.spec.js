const { createSocket, createTestUser, testData, createTestClass } = require("@modules/tests/tests");
const { run: apiKeyRun } = require("../apikey");
const { dbRun } = require("@modules/database");

describe("apikey", () => {
    let socket;
    let socketUpdates;
    let refreshApiKeyHandler;

    beforeEach(() => {
        socket = createSocket();

        // Run the socket handler
        apiKeyRun(socket, socketUpdates);
        refreshApiKeyHandler = socket.on.mock.calls.find((call) => call[0] === "refreshApiKey")[1];
    });

    it("should fail if user id is not found in session", async () => {
        socket.request.session.userId = null;
        await refreshApiKeyHandler();
        expect(socket.emit).toHaveBeenCalledWith("error", expect.stringContaining("There was a server error"));
    });

    it("should update API key in session and database", async () => {
        socket.request.session.userId = 1;
        await refreshApiKeyHandler();

        expect(socket.request.session.API).toBeDefined();
        expect(dbRun).toHaveBeenCalledWith("UPDATE users SET API = ? WHERE id = ?", [socket.request.session.API, 1]);
    });
});
