const AppError = require('./app-error');

class ValidationError extends AppError {
    constructor(message, statusCode = 400, options = {}) {
        super(message, statusCode, options);
    }
}

module.exports = ValidationError;