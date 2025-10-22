// Prevent the tests from using the logger as it can cause tests to fail
jest.mock("./modules/logger.js", () => ({
    logger: {
        log: jest.fn(),
    },
}));

// Prevent tests from using the actual database
jest.mock("./modules/database", () => ({
    database: {
        get: jest.fn(),
        run: jest.fn(),
        all: jest.fn(),
    },
    dbGet: jest.fn().mockResolvedValue({}),
    dbRun: jest.fn().mockResolvedValue({}),
    dbGetAll: jest.fn().mockResolvedValue({}),
}));
