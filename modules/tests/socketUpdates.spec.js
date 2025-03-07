const { SocketUpdates, advancedEmitToClass } = require('../socketUpdates');
const { createTestUser, createTestClass, testData} = require('./testData');
const { io } = require("../webServer");
const { log } = require("console");

// describe("Socket Updates", () => {
//     beforeEach(() => {
//         jest.resetAllMocks();
//
//         mockSockets = [
//             {
//                 request: { session: { username: "user1" } },
//                 rooms: new Set(["class-1", "api-some"]),
//                 emit: jest.fn(),
//             },
//             {
//                 request: { session: { username: "user2" } },
//                 rooms: new Set(["class-1"]),
//                 emit: jest.fn(),
//             },
//         ];
//
//         io.in = jest.fn().mockReturnValue({mockSockets});
//     })
// })

test('Virtualbar Update', async () => {
    createTestUser(testData.username);
    createTestClass(testData.code, 'Test Class');

    const mockSockets = [
        {
            request: { session: { username: testData.username } },
            emit: (event, data) => {
                log(event, data)''
            }
        }
    ];

    io.in = jest.fn().mockReturnValue({
        fetchSockets: () => mockSockets
    });

    const socketUpdates = new SocketUpdates();
    socketUpdates.virtualBarUpdate(testData.code);
});