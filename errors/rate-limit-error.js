const AppError = require("./app-error");

class RateLimitError extends AppError {
    constructor(message, options = {}) {
        super(message, { statusCode: 429, ...options });
    }
}

module.exports = RateLimitError;
