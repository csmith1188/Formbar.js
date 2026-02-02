const AppError = require("./app-error");

class ValidationError extends AppError {
    constructor(message, statusCode = 400, event, options = {}) {
        super(message, statusCode, event, options);
    }
}

module.exports = ValidationError;
