const AppError = require("./app-error");

class ForbiddenError extends AppError {
    constructor(message, statusCode = 403, options = {}) {
        super(message, statusCode, options);
    }
}

module.exports = ForbiddenError;
