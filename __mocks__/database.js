const database = {
    get: jest.fn(),
    run: jest.fn(),
    resetMocks: () => {
        database.get.mockReset();
        database.run.mockReset();
    },
    mockQuery: (queryHandlers) => {
        database.get.mockImplementation((query, params, callback) => {
            const handler = queryHandlers.find(h => query.includes(h.query));
            if (handler) {
                handler.response(params, callback);
            } else {
                callback(new Error('Unexpected query'));
            }
        });

        database.run.mockImplementation((query, params, callback) => {
            callback(null);
        });
    }
};

module.exports = { database };
