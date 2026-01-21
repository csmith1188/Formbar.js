const AppError = require("./app-error");

class ConflictError extends AppError {
    constructor(message, statusCode = 409, options = {}) {
        super(message, statusCode, options);
    }
}

module.exports = ConflictError;
