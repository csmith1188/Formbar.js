const AppError = require("./app-error");

class ConflictError extends AppError {
    constructor(message, statusCode = 409, event, options = {}) {
        super(message, statusCode, event, options);
    }
}

module.exports = ConflictError;
