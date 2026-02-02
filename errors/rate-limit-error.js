const AppError = require("./app-error");

class RateLimitError extends AppError {
    constructor(message, statusCode = 429, event, options = {}) {
        super(message, statusCode, event, options);
    }
}

module.exports = RateLimitError;
