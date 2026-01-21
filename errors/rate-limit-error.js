const AppError = require("./app-error");

class RateLimitError extends AppError {
    constructor(message, statusCode = 429, options = {}) {
        super(message, statusCode, options);
    }
}

module.exports = RateLimitError;
