const AppError = require("./app-error");

class ValidationError extends AppError {
    constructor(message, options = {}) {
        super(message, { statusCode: 400, ...options });
    }
}

module.exports = ValidationError;
