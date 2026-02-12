const AppError = require("./app-error");

class NotFoundError extends AppError {
    constructor(message, options = {}) {
        super(message, { statusCode: 404, ...options });
    }
}

module.exports = NotFoundError;
