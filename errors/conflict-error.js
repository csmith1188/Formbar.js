const AppError = require("./app-error");

class ConflictError extends AppError {
    constructor(message, options = {}) {
        super(message, { statusCode: 409, ...options });
    }
}

module.exports = ConflictError;
