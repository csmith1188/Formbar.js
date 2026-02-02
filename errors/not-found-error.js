const AppError = require("./app-error");

class NotFoundError extends AppError {
    constructor(message, statusCode = 404, event, options = {}) {
        super(message, statusCode, event, options);
    }
}

module.exports = NotFoundError;
