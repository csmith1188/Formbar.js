module.exports = {
    setupFiles: ["<rootDir>/jest.setup.js"],
    moduleNameMapper: {
        "^@modules/(.*)$": "<rootDir>/modules/$1",
        "^@services/(.*)$": "<rootDir>/services/$1",
        "^@controllers/(.*)$": "<rootDir>/api/v1/controllers/$1",
        "^@errors/(.*)$": "<rootDir>/errors/$1",
        "^@sockets/(.*)$": "<rootDir>/sockets/$1",
    },
    testEnvironment: "node",
};
