const AppError = require("./app-error");

class NotFoundError extends AppError {
    constructor(message, statusCode = 404, options = {}) {
        super(message, statusCode, options);
    }
}

module.exports = NotFoundError;
