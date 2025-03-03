jest.mock('./modules/database', () => ({
    database: {
        get: jest.fn(),
        run: jest.fn(),
    },
}));